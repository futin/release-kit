import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGhPort, createLog } from '../src/release-cli.js';
import { git } from '../src/git.js';
import { makeRepo } from './fixtures/repo.js';
import type { TestRepo } from './fixtures/repo.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const FAKE = join(ROOT, 'test/fixtures/fake-gh-release.sh');
const CLI = join(ROOT, 'src/release-cli.ts');
const TSX = fileURLToPath(import.meta.resolve('tsx'));
const BASELINE = 'Baseline — versioning starts here\n';
const REPO = 'acme/app';

const cleanups: (() => void)[] = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
});

// A repo with a bare origin, a baseline tag v0.1.0 on its first commit, and a fake `gh` first on PATH whose canned answers and call log live in `gh`.
function setup() {
  const repo = makeRepo({ bareOrigin: true });
  const gh = mkdtempSync(join(tmpdir(), 'release-kit-gh-'));
  copyFileSync(FAKE, join(gh, 'gh'));
  cleanups.push(() => repo.cleanup(), () => rmSync(gh, { recursive: true, force: true }));
  const base = repo.commit('chore: baseline');
  repo.tag('v0.1.0', base, BASELINE);
  // The engine repairs a baseline whose Release is missing; these tests are about the commits after it.
  writeFileSync(join(gh, 'release-v0.1.0'), '');
  return { repo, gh, base };
}

const canned = (gh: string, path: string, body: unknown): void => writeFileSync(join(gh, `${path.replaceAll('/', '_')}.json`), JSON.stringify(body));

const calls = (gh: string): string[][] => {
  const file = join(gh, 'calls.log');
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => l.split('\t').slice(0, -1));
};

function runCli(repo: TestRepo, gh: string, env: Record<string, string | undefined>) {
  // The workflow's checkout has origin/main; the fixture's bare origin is empty, so the tracking ref is set by hand to the local main.
  spawnSync('git', ['update-ref', 'refs/remotes/origin/main', 'main'], { cwd: repo.dir });
  return spawnSync(process.execPath, ['--import', TSX, CLI], {
    cwd: repo.dir,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${gh}:${process.env.PATH}`,
      FAKE_GH_DIR: gh,
      GITHUB_REPOSITORY: REPO,
      GH_TOKEN: 'test-token',
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_CONFIG_SYSTEM: '/dev/null',
      GIT_CONFIG_NOSYSTEM: '1',
      GITHUB_EVENT_NAME: undefined,
      DEFAULT_BRANCH: 'main',
      ...env,
    },
  });
}

const pullJson = (number: number, title: string, body: string | null, sha: string, mergedAt: string | null = '2026-10-16T10:00:00Z') => ({
  number,
  title,
  body,
  merged_at: mergedAt,
  merge_commit_sha: sha,
});

describe('release-cli', () => {
  it('releases a hostile title and body as literal text', () => {
    const { repo, gh } = setup();
    const pwned = join(gh, 'pwned');
    const title = `feat: $(touch ${pwned})`;
    const sha = repo.commit(`${title} (#5)`);
    canned(gh, `repos/${REPO}/commits/${sha}/pulls`, [pullJson(5, title, "## What's new\n`touch " + pwned + '` and $(touch ' + pwned + ')\n', sha)]);

    const r = runCli(repo, gh, { TARGET_SHA: sha });

    assert.equal(r.status, 0, r.stderr + r.stdout);
    assert.equal(existsSync(pwned), false, 'the title or body was executed');
    assert.equal(spawnSync('git', ['tag', '--list', 'v0.2.0'], { cwd: repo.dir, encoding: 'utf8' }).stdout.trim(), 'v0.2.0');
    const create = calls(gh).find((c) => c[0] === 'release' && c[1] === 'create')!;
    assert.deepEqual(create.slice(0, 4), ['release', 'create', 'v0.2.0', '--verify-tag']);
    assert.equal(create[create.indexOf('--title') + 1], `${title} (#5)`);
    assert.ok(readFileSync(join(gh, 'notes-v0.2.0'), 'utf8').includes(`$(touch ${pwned})`));
  });

  it('passes the token through and releases against the repository it was given', () => {
    const { repo, gh } = setup();
    const sha = repo.commit('fix: a thing (#6)');
    canned(gh, `repos/${REPO}/commits/${sha}/pulls`, [pullJson(6, 'fix: a thing', null, sha)]);

    const r = runCli(repo, gh, { TARGET_SHA: sha });

    assert.equal(r.status, 0, r.stderr + r.stdout);
    assert.ok(calls(gh).some((c) => c[0] === 'api' && c[1] === `repos/${REPO}/commits/${sha}/pulls`));
    assert.ok(existsSync(join(gh, 'release-v0.1.1')));
  });

  it('rejects a malformed TARGET_SHA before any gh call', () => {
    const { repo, gh } = setup();
    const r = runCli(repo, gh, { TARGET_SHA: 'nope' });
    assert.equal(r.status, 1);
    assert.match(r.stderr + r.stdout, /TARGET_SHA/);
    assert.deepEqual(calls(gh), []);
  });

  it('rejects a missing TARGET_SHA or GITHUB_REPOSITORY', () => {
    const { repo, gh } = setup();
    const sha = repo.commit('fix: x (#1)');
    assert.equal(runCli(repo, gh, { TARGET_SHA: undefined }).status, 1);
    assert.equal(runCli(repo, gh, { TARGET_SHA: sha, GITHUB_REPOSITORY: undefined }).status, 1);
    assert.deepEqual(calls(gh), []);
  });

  it('rejects a missing or empty DEFAULT_BRANCH before any gh call', () => {
    const { repo, gh } = setup();
    const sha = repo.commit('fix: x (#1)');
    for (const DEFAULT_BRANCH of [undefined, '']) {
      const r = runCli(repo, gh, { TARGET_SHA: sha, DEFAULT_BRANCH });
      assert.equal(r.status, 1);
      assert.match(r.stdout, /^::error::.*DEFAULT_BRANCH/m);
    }
    assert.deepEqual(calls(gh), []);
  });

  it('fails a target that is not on origin/<DEFAULT_BRANCH> without a gh call or a tag', () => {
    const { repo, gh } = setup();
    spawnSync('git', ['checkout', '-q', '-b', 'side'], { cwd: repo.dir });
    const side = repo.commit('feat: side (#4)');
    spawnSync('git', ['checkout', '-q', 'main'], { cwd: repo.dir });
    repo.commit('feat: a (#1)');
    const r = runCli(repo, gh, { TARGET_SHA: side });
    assert.equal(r.status, 1);
    assert.match(r.stdout, new RegExp(`^::error::target ${side} is not on origin/main$`, 'm'));
    assert.deepEqual(calls(gh), []);
    assert.equal(spawnSync('git', ['tag', '--list', 'v0.2.0'], { cwd: repo.dir, encoding: 'utf8' }).stdout.trim(), '');
  });

  it('treats a 404 from the PR lookup as no PR and goes on', () => {
    const { repo, gh } = setup();
    const sha = repo.commit('fix: a thing (#9)');
    writeFileSync(join(gh, `repos_${REPO.replace('/', '_')}_pulls_9.404`), '');

    const r = runCli(repo, gh, { TARGET_SHA: sha });

    assert.equal(r.status, 0, r.stderr + r.stdout);
    assert.match(r.stdout, new RegExp(`::warning::no PR for ${sha}`));
    assert.ok(calls(gh).some((c) => c[0] === 'api' && c[1] === `repos/${REPO}/pulls/9`));
    assert.equal(spawnSync('git', ['tag', '--list', 'v0.1.1'], { cwd: repo.dir, encoding: 'utf8' }).stdout.trim(), '');
  });

  it('fails on any other gh api failure instead of treating it as no PR', () => {
    const { repo, gh } = setup();
    const sha = repo.commit('fix: a thing (#9)');
    writeFileSync(join(gh, `repos_${REPO.replace('/', '_')}_pulls_9.500`), '');
    const r = runCli(repo, gh, { TARGET_SHA: sha });
    assert.equal(r.status, 1);
    assert.match(r.stdout, /^::error::/m);
  });

  it('fails when gh release view fails for a reason other than not found', () => {
    const { repo, gh } = setup();
    // The baseline's Release must be missing for the engine to ask about it at all.
    rmSync(join(gh, 'release-v0.1.0'));
    writeFileSync(join(gh, 'release-view-broken'), '');
    const sha = repo.commit('fix: a thing (#9)');
    const r = runCli(repo, gh, { TARGET_SHA: sha });
    assert.equal(r.status, 1);
    assert.match(r.stdout, /^::error::/m);
  });

  describe('a newer release exists', () => {
    // v0.1.0 at the baseline, a commit that is the target, then a later commit already carrying v0.2.0.
    function withNewer() {
      const s = setup();
      const target = s.repo.commit('feat: a (#2)');
      const later = s.repo.commit('feat: b (#3)');
      s.repo.tag('v0.2.0', later, 'feat: b (#3)\n\nRelease-Type: feat\nRelease-PR: 3\n');
      return { ...s, target };
    }

    it('ends green on a push run, which may be a re-run of a superseded one', () => {
      const { repo, gh, target } = withNewer();
      const r = runCli(repo, gh, { TARGET_SHA: target, GITHUB_EVENT_NAME: 'push' });
      assert.equal(r.status, 0, r.stderr + r.stdout);
      assert.match(r.stdout, /a newer release exists: v0\.2\.0/);
      assert.deepEqual(calls(gh), []);
    });

    it('fails a manual dispatch, where the operator should hear it', () => {
      const { repo, gh, target } = withNewer();
      const r = runCli(repo, gh, { TARGET_SHA: target, GITHUB_EVENT_NAME: 'workflow_dispatch' });
      assert.equal(r.status, 1);
      assert.match(r.stdout, /^::error::a newer release exists: v0\.2\.0$/m);
      assert.deepEqual(calls(gh), []);
    });

    it('ends green when the event name is absent', () => {
      const { repo, gh, target } = withNewer();
      assert.equal(runCli(repo, gh, { TARGET_SHA: target }).status, 0);
    });
  });
});

describe('createLog', () => {
  it('escapes %, CR and LF so a warning stays one workflow command', () => {
    const lines: string[] = [];
    createLog((l) => lines.push(l)).warning('100% done\r\nsecond line\nthird');
    assert.deepEqual(lines, ['::warning::100%25 done%0D%0Asecond line%0Athird']);
  });

  it('prints info lines plain', () => {
    const lines: string[] = [];
    createLog((l) => lines.push(l)).info('hello');
    assert.deepEqual(lines, ['hello']);
  });
});

describe('createGhPort', () => {
  // The port only needs `gh` on PATH; reuse the fake with a dir of canned answers.
  function port() {
    const gh = mkdtempSync(join(tmpdir(), 'release-kit-gh-'));
    copyFileSync(FAKE, join(gh, 'gh'));
    cleanups.push(() => rmSync(gh, { recursive: true, force: true }));
    const saved = { PATH: process.env.PATH, FAKE_GH_DIR: process.env.FAKE_GH_DIR };
    process.env.PATH = `${gh}:${process.env.PATH}`;
    process.env.FAKE_GH_DIR = gh;
    cleanups.push(() => {
      process.env.PATH = saved.PATH;
      if (saved.FAKE_GH_DIR === undefined) delete process.env.FAKE_GH_DIR;
      else process.env.FAKE_GH_DIR = saved.FAKE_GH_DIR;
    });
    return { gh, github: createGhPort(REPO) };
  }

  it('maps merged_at and merge_commit_sha, and a null merged_at is not merged', async () => {
    const { gh, github } = port();
    canned(gh, `repos/${REPO}/commits/abc1234/pulls`, [pullJson(1, 'feat: a', 'body', 'abc1234'), pullJson(2, 'feat: b', null, 'ffff', null)]);
    assert.deepEqual(await github.pullsForCommit('abc1234'), [
      { number: 1, title: 'feat: a', body: 'body', merged: true, mergeCommitSha: 'abc1234' },
      { number: 2, title: 'feat: b', body: null, merged: false, mergeCommitSha: 'ffff' },
    ]);
  });

  it('getPull maps one pull and answers null on a 404', async () => {
    const { gh, github } = port();
    canned(gh, `repos/${REPO}/pulls/3`, pullJson(3, 'fix: c', 'b', 'cafe'));
    assert.deepEqual(await github.getPull(3), { number: 3, title: 'fix: c', body: 'b', merged: true, mergeCommitSha: 'cafe' });
    writeFileSync(join(gh, `repos_${REPO.replace('/', '_')}_pulls_4.404`), '');
    assert.equal(await github.getPull(4), null);
  });

  it('releaseExists is false only for "release not found"', async () => {
    const { gh, github } = port();
    assert.equal(await github.releaseExists('v1.0.0'), false);
    writeFileSync(join(gh, 'release-v1.0.0'), '');
    assert.equal(await github.releaseExists('v1.0.0'), true);
    writeFileSync(join(gh, 'release-view-broken'), '');
    await assert.rejects(github.releaseExists('v2.0.0'), /network unreachable/);
  });

  it('createRelease hands the notes over as a file, never on the command line', async () => {
    const { gh, github } = port();
    await github.createRelease('v1.2.3', 'feat: $(x) (#1)', '`notes`\n$(y)\n');
    const [create] = calls(gh).filter((c) => c[1] === 'create');
    assert.deepEqual(create.slice(0, 4), ['release', 'create', 'v1.2.3', '--verify-tag']);
    assert.ok(!create.some((a) => a.includes('$(y)')), 'the notes reached argv');
    assert.equal(readFileSync(join(gh, 'notes-v1.2.3'), 'utf8'), '`notes`\n$(y)\n');
    assert.equal(create[create.indexOf('--title') + 1], 'feat: $(x) (#1)');
  });
});
