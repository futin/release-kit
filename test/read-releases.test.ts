import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultGitPort, formatTagMessage, readReleases, readReleasesResult, writeReleasesJson } from '../src/index.js';
import type { GitPort } from '../src/index.js';
import { DESCRIBE_FILTER, TAG_FORMAT, git, versionTags, versionTagsAt } from '../src/git.js';
import { makeRepo } from './fixtures/repo.js';

const BASELINE = 'Baseline — versioning starts here\n';
const EMPTY = { current: null, releases: [] };
const feat = (title: string, pr: number, notes = '') => formatTagMessage({ title, pr, notes, type: 'feat', breaking: false });

test('a directory that is not a git repo reads as empty and does not reject', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'release-kit-nogit-'));
  try {
    assert.deepEqual(await readReleases(dir), EMPTY);
    assert.deepEqual(await readReleases(join(dir, 'missing')), EMPTY);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a repo with no tags reads as empty', async () => {
  const r = makeRepo();
  try {
    r.commit('one');
    assert.deepEqual(await readReleases(r.dir), EMPTY);
  } finally {
    r.cleanup();
  }
});

test('only lightweight v9.9.9 and v1 read as empty', async () => {
  const r = makeRepo();
  try {
    const sha = r.commit('one');
    r.tag('v9.9.9', sha);
    r.tag('v1', sha);
    assert.deepEqual(await readReleases(r.dir), EMPTY);
  } finally {
    r.cleanup();
  }
});

test('lightweight tags, a floating major and an annotated prerelease are never current and never listed', async () => {
  const r = makeRepo();
  try {
    const base = r.commit('base');
    r.tag('v0.1.0', base, BASELINE);
    const head = r.commit('head');
    r.tag('v9.9.9', head);
    r.tag('v1', head);
    r.tag('v1.2.3-rc1', head, feat('rc', 5));
    const got = await readReleases(r.dir);
    assert.deepEqual(got.current, { version: '0.1.0', ahead: 1 });
    assert.deepEqual(got.releases.map((x) => x.version), ['0.1.0']);
    assert.equal(got.releases[0].type, 'baseline');
  } finally {
    r.cleanup();
  }
});

test('the example from the brief: baseline on HEAD with the three non-release tags gives ahead 0 and one release', async () => {
  const r = makeRepo();
  try {
    const sha = r.commit('base');
    r.tag('v0.1.0', sha, BASELINE);
    r.tag('v9.9.9', sha);
    r.tag('v1', sha);
    r.tag('v1.2.3-rc1', sha, feat('rc', 5));
    const got = await readReleases(r.dir);
    assert.deepEqual(got.current, { version: '0.1.0', ahead: 0 });
    assert.equal(got.releases.length, 1);
  } finally {
    r.cleanup();
  }
});

test('ahead counts commits past the newest tag, and releases come newest first with a parseable date', async () => {
  const r = makeRepo();
  try {
    r.tag('v0.1.0', r.commit('base'), BASELINE);
    r.tag('v0.2.0', r.commit('feature'), feat('Add a thing', 7));
    r.commit('a');
    r.commit('b');
    r.commit('c');
    const got = await readReleases(r.dir);
    assert.deepEqual(got.current, { version: '0.2.0', ahead: 3 });
    assert.deepEqual(got.releases.map((x) => x.version), ['0.2.0', '0.1.0']);
    for (const x of got.releases) assert.ok(!Number.isNaN(Date.parse(x.date)), x.date);
  } finally {
    r.cleanup();
  }
});

test('a tag made with formatTagMessage round-trips every field, notes verbatim', async () => {
  const r = makeRepo();
  try {
    const notes = 'Intro line\n\n### x\n\n#123 y\n- bullet\n\nNote: see #12';
    r.tag('v0.3.0', r.commit('c'), formatTagMessage({ title: 'Reshape the hub', pr: 12, notes, type: 'feat', scope: 'hub', breaking: true }));
    const [rel] = (await readReleases(r.dir)).releases;
    assert.equal(rel.version, '0.3.0');
    assert.equal(rel.title, 'Reshape the hub');
    assert.equal(rel.type, 'feat');
    assert.equal(rel.scope, 'hub');
    assert.equal(rel.pr, 12);
    assert.equal(rel.breaking, true);
    assert.equal(rel.notes, notes);
    assert.equal('url' in rel, false);
  } finally {
    r.cleanup();
  }
});

test('url is the PR page for a GitHub origin in ssh or https form, and absent for a local path', async () => {
  const r = makeRepo();
  try {
    r.tag('v0.3.0', r.commit('c'), feat('t', 12));
    r.setOrigin('git@github.com:futin/x.git');
    assert.equal((await readReleases(r.dir)).releases[0].url, 'https://github.com/futin/x/pull/12');
    r.setOrigin('https://github.com/futin/x');
    assert.equal((await readReleases(r.dir)).releases[0].url, 'https://github.com/futin/x/pull/12');
    r.setOrigin('https://github.com/futin/x.git');
    assert.equal((await readReleases(r.dir)).releases[0].url, 'https://github.com/futin/x/pull/12');
    r.setOrigin('/some/local/path.git');
    assert.equal('url' in (await readReleases(r.dir)).releases[0], false);
  } finally {
    r.cleanup();
  }
});

test('a baseline release has no pr and so no url even with a GitHub origin', async () => {
  const r = makeRepo();
  try {
    r.tag('v0.1.0', r.commit('c'), BASELINE);
    r.setOrigin('git@github.com:futin/x.git');
    const [rel] = (await readReleases(r.dir)).releases;
    assert.equal('url' in rel, false);
    assert.equal('pr' in rel, false);
  } finally {
    r.cleanup();
  }
});

test('writeReleasesJson writes what readReleases returns, creating the directory', async () => {
  const r = makeRepo();
  const out = mkdtempSync(join(tmpdir(), 'release-kit-out-'));
  try {
    r.tag('v0.1.0', r.commit('base'), BASELINE);
    r.tag('v0.2.0', r.commit('f'), feat('Add', 3, 'notes'));
    const file = join(out, 'nested', 'releases.json');
    await writeReleasesJson(r.dir, file);
    assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), await readReleases(r.dir));
  } finally {
    r.cleanup();
    rmSync(out, { recursive: true, force: true });
  }
});

test('the releases-json CLI takes <outFile> [repoRoot]', () => {
  const r = makeRepo();
  const out = mkdtempSync(join(tmpdir(), 'release-kit-out-'));
  try {
    r.tag('v0.1.0', r.commit('base'), BASELINE);
    const file = join(out, 'releases.json');
    const cli = fileURLToPath(new URL('../src/releases-json.ts', import.meta.url));
    execFileSync(process.execPath, ['--import', 'tsx', cli, file, r.dir], { stdio: 'pipe' });
    const got = JSON.parse(readFileSync(file, 'utf8'));
    assert.deepEqual(got.current, { version: '0.1.0', ahead: 0 });
    assert.equal(got.releases.length, 1);
  } finally {
    r.cleanup();
    rmSync(out, { recursive: true, force: true });
  }
});

test('versionTags lists annotated version tags with their peeled commits and nothing else', async () => {
  const r = makeRepo();
  try {
    const a = r.commit('a');
    const b = r.commit('b');
    r.tag('v0.1.0', a, BASELINE);
    r.tag('v0.2.0', b, feat('t', 1));
    r.tag('v0.3.0', b);
    r.tag('v1', b, 'floating');
    r.tag('v1.0.0-rc1', b, 'rc');
    const got = await versionTags(r.dir);
    assert.deepEqual(got.map((t) => [t.name, t.commit]).sort(), [['v0.1.0', a], ['v0.2.0', b]]);
  } finally {
    r.cleanup();
  }
});

test('makeRepo({ bareOrigin }) gives an origin that tags can be pushed to', async () => {
  const r = makeRepo({ bareOrigin: true });
  try {
    assert.ok(r.origin);
    r.tag('v0.1.0', r.commit('c'), BASELINE);
    await git(r.dir, ['push', '-q', 'origin', 'main', 'v0.1.0']);
    assert.match(await git(r.origin!, ['tag', '--list']), /^v0\.1\.0$/);
  } finally {
    r.cleanup();
  }
});

test('versionTagsAt returns only the annotated version tags on that commit', async () => {
  const r = makeRepo();
  try {
    const a = r.commit('a');
    const b = r.commit('b');
    r.tag('v0.1.0', a, BASELINE);
    r.tag('v0.2.0', b, feat('t', 1));
    r.tag('v0.2.1', b);
    r.tag('v1', b, 'floating');
    r.tag('v0.2.0-rc1', b, 'rc');
    assert.deepEqual(await versionTagsAt(r.dir, b), ['v0.2.0']);
    assert.deepEqual(await versionTagsAt(r.dir, a), ['v0.1.0']);
  } finally {
    r.cleanup();
  }
});

// A port that records every call it receives and hands it to `inner`; `fail` names the reads that answer null instead.
const recording = (inner: GitPort, fail: (args: string[]) => boolean = () => false) => {
  const calls: { args: string[]; maxBuffer?: number }[] = [];
  const port: GitPort = async (args, o) => {
    calls.push({ args, maxBuffer: o.maxBuffer });
    return fail(args) ? null : inner(args, o);
  };
  return { port, calls };
};

// Raw stdout, trailing newline and all: the reader must not depend on its port trimming.
const untrimmed: GitPort = (args, o) =>
  new Promise((resolve) => execFile('git', args, { cwd: o.cwd, encoding: 'utf8', maxBuffer: o.maxBuffer }, (err, stdout) => resolve(err ? null : stdout)));

const sh = (cwd: string, args: string[], env: Record<string, string> = {}) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', ...env } });

test('a custom port receives exactly the three reads the default port would run, for-each-ref with a 32 MiB maxBuffer', async () => {
  const r = makeRepo();
  try {
    r.tag('v0.1.0', r.commit('base'), BASELINE);
    const { port, calls } = recording(defaultGitPort());
    const got = await readReleasesResult(r.dir, { git: port });
    assert.equal(got.complete, true);
    const sorted = [...calls].sort((a, b) => a.args.join(' ').localeCompare(b.args.join(' ')));
    assert.deepEqual(sorted.map((c) => c.args), [
      ['describe', '--long', ...DESCRIBE_FILTER],
      ['for-each-ref', '--sort=-creatordate', TAG_FORMAT, 'refs/tags/v*'],
      ['remote', 'get-url', 'origin'],
    ]);
    assert.equal(calls.find((c) => c.args[0] === 'for-each-ref')?.maxBuffer, 33554432);
  } finally {
    r.cleanup();
  }
});

test('a port answering null for for-each-ref gives the empty shape, incomplete', async () => {
  const r = makeRepo();
  try {
    r.tag('v0.1.0', r.commit('base'), BASELINE);
    const { port } = recording(defaultGitPort(), (a) => a[0] === 'for-each-ref');
    assert.deepEqual(await readReleasesResult(r.dir, { git: port }), { value: EMPTY, complete: false });
    assert.deepEqual(await readReleases(r.dir, { git: port }), EMPTY);
  } finally {
    r.cleanup();
  }
});

test('a port answering null for describe only keeps the releases, current null, incomplete', async () => {
  const r = makeRepo();
  try {
    r.tag('v0.1.0', r.commit('base'), BASELINE);
    r.tag('v0.2.0', r.commit('f'), feat('Add', 3));
    const { port } = recording(defaultGitPort(), (a) => a[0] === 'describe');
    const got = await readReleasesResult(r.dir, { git: port });
    assert.equal(got.value.releases.length, 2);
    assert.equal(got.value.current, null);
    assert.equal(got.complete, false);
  } finally {
    r.cleanup();
  }
});

test('a branch cut before the baseline keeps the releases with current null, incomplete', async () => {
  const r = makeRepo();
  try {
    const root = r.commit('root');
    r.tag('v0.1.0', r.commit('base'), BASELINE);
    sh(r.dir, ['checkout', '-q', '-b', 'old', root]);
    r.commit('on the old branch');
    const got = await readReleasesResult(r.dir);
    assert.deepEqual(got.value.releases.map((x) => x.version), ['0.1.0']);
    assert.equal(got.value.current, null);
    assert.equal(got.complete, false);
  } finally {
    r.cleanup();
  }
});

test('a port answering null for remote get-url leaves no url on a PR release, still complete', async () => {
  const r = makeRepo();
  try {
    r.tag('v0.2.0', r.commit('f'), feat('Add', 3));
    r.setOrigin('git@github.com:futin/x.git');
    const { port } = recording(defaultGitPort(), (a) => a[0] === 'remote');
    const got = await readReleasesResult(r.dir, { git: port });
    assert.equal(got.value.releases[0].pr, 3);
    assert.equal('url' in got.value.releases[0], false);
    assert.equal(got.complete, true);
  } finally {
    r.cleanup();
  }
});

test('a repo with no version tags is the empty shape, complete', async () => {
  const r = makeRepo();
  try {
    r.tag('v9.9.9', r.commit('one'));
    assert.deepEqual(await readReleasesResult(r.dir), { value: EMPTY, complete: true });
  } finally {
    r.cleanup();
  }
});

test('a trimming port and an untrimmed one read a CRLF tag message with a trailing blank line identically', async () => {
  const r = makeRepo();
  try {
    r.tag('v0.1.0', r.commit('base'), BASELINE);
    r.tag('v0.2.0', r.commit('f'), feat('Add a thing', 7, 'line one\nline two').replace(/\n/g, '\r\n') + '\r\n\r\n');
    r.commit('ahead');
    r.setOrigin('https://github.com/futin/x.git');
    const trimmed = await readReleasesResult(r.dir, { git: async (a, o) => (await defaultGitPort()(a, o))?.trim() ?? null });
    const raw = await readReleasesResult(r.dir, { git: untrimmed });
    assert.deepEqual(raw, trimmed);
    assert.equal(raw.complete, true);
    assert.deepEqual(raw.value.current, { version: '0.2.0', ahead: 1 });
    assert.equal(raw.value.releases[0].url, 'https://github.com/futin/x/pull/7');
  } finally {
    r.cleanup();
  }
});

test('v0.9.0 and v0.10.0 tagged in the same second order by version through a custom port', async () => {
  const r = makeRepo();
  try {
    const sha = r.commit('one');
    const date = { GIT_COMMITTER_DATE: '2026-01-01T00:00:00Z' };
    sh(r.dir, ['tag', '-a', 'v0.9.0', sha, '-m', BASELINE], date);
    sh(r.dir, ['tag', '-a', 'v0.10.0', sha, '-m', feat('Ten', 10)], date);
    // git breaks a creatordate tie by ascending name, which already puts v0.10.0 before v0.9.0; v0.9.1 is the tag that order gets wrong.
    sh(r.dir, ['tag', '-a', 'v0.9.1', sha, '-m', feat('Nine one', 9)], date);
    const { port } = recording(untrimmed);
    const got = await readReleasesResult(r.dir, { git: port });
    assert.equal(new Set(got.value.releases.map((x) => x.date)).size, 1);
    assert.equal(got.value.releases[0].version, '0.10.0');
    assert.deepEqual(got.value.releases.map((x) => x.version), ['0.10.0', '0.9.1', '0.9.0']);
  } finally {
    r.cleanup();
  }
});

test('the default port kills a hung git at timeoutMs and reads as empty, incomplete', async () => {
  const r = makeRepo();
  const bin = mkdtempSync(join(tmpdir(), 'release-kit-fakegit-'));
  const path = process.env.PATH;
  try {
    r.tag('v0.1.0', r.commit('base'), BASELINE);
    symlinkSync(fileURLToPath(new URL('./fixtures/fake-git.sh', import.meta.url)), join(bin, 'git'));
    process.env.PATH = `${bin}:${path}`;
    const t0 = Date.now();
    const got = await readReleasesResult(r.dir, { timeoutMs: 200 });
    const elapsed = Date.now() - t0;
    assert.ok(elapsed < 2000, `took ${elapsed} ms`);
    assert.deepEqual(got, { value: EMPTY, complete: false });
  } finally {
    process.env.PATH = path;
    r.cleanup();
    rmSync(bin, { recursive: true, force: true });
  }
});
