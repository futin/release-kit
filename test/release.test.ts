import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractWhatsNew, formatTagMessage, isBreaking, checkTitle, runRelease } from '../src/index.js';
import type { GitHubPort, PullRequest } from '../src/index.js';
import { git } from '../src/git.js';
import { makeRepo } from './fixtures/repo.js';
import type { TestRepo } from './fixtures/repo.js';

const BASELINE = 'Baseline — versioning starts here\n';

type Fake = {
  port: GitHubPort;
  created: { tag: string; title: string; notes: string }[];
  warnings: string[];
  infos: string[];
  portCalls: number;
  pullCalls: string[];
  getPullCalls: number[];
};

// An in-memory GitHub: `pulls` answers pullsForCommit by sha, `byNumber` answers getPull, and createRelease makes releaseExists true so a second run sees it.
function fake(o: { pulls?: Record<string, PullRequest[]>; byNumber?: Record<number, PullRequest>; releases?: string[] } = {}): Fake {
  const releases = new Set(o.releases ?? []);
  const f: Fake = { port: undefined as unknown as GitHubPort, created: [], warnings: [], infos: [], portCalls: 0, pullCalls: [], getPullCalls: [] };
  f.port = {
    async pullsForCommit(sha) {
      f.portCalls++;
      f.pullCalls.push(sha);
      return o.pulls?.[sha] ?? [];
    },
    async getPull(n) {
      f.portCalls++;
      f.getPullCalls.push(n);
      return o.byNumber?.[n] ?? null;
    },
    async releaseExists(tag) {
      f.portCalls++;
      return releases.has(tag);
    },
    async createRelease(tag, title, notes) {
      f.portCalls++;
      releases.add(tag);
      f.created.push({ tag, title, notes });
    },
  };
  return f;
}

const pr = (number: number, title: string, sha: string | null, body: string | null = null, merged = true): PullRequest => ({
  number,
  title,
  body,
  merged,
  mergeCommitSha: sha,
});

const log = (f: Fake) => ({ info: (m: string) => void f.infos.push(m), warning: (m: string) => void f.warnings.push(m) });

const originTags = async (r: TestRepo): Promise<string[]> => {
  const out = await git(r.origin!, ['tag', '-l']);
  return out ? out.split('\n').sort() : [];
};

const originMessage = (r: TestRepo, tag: string): Promise<string> => git(r.origin!, ['for-each-ref', '--format=%(contents)', `refs/tags/${tag}`]);

async function withRepo(fn: (r: TestRepo) => Promise<void>): Promise<void> {
  const r = makeRepo({ bareOrigin: true });
  try {
    await fn(r);
  } finally {
    r.cleanup();
  }
}

const run = (r: TestRepo, f: Fake, target: string, onNewer: 'reject' | 'skip') => runRelease({ cwd: r.dir, target, github: f.port, log: log(f), onNewer });

test('no baseline tag reachable: nothing released, one warning, no tag pushed', async () => {
  await withRepo(async (r) => {
    const sha = r.commit('feat: a (#1)');
    const f = fake({ pulls: { [sha]: [pr(1, 'feat: a', sha)] } });
    assert.deepEqual(await run(r, f, sha, 'reject'), []);
    assert.equal(f.warnings.length, 1);
    assert.match(f.warnings[0], /no baseline tag/);
    assert.deepEqual(await originTags(r), []);
    assert.deepEqual(f.created, []);
  });
});

test('only a lightweight or prerelease tag counts as no baseline tag', async () => {
  await withRepo(async (r) => {
    const a = r.commit('one');
    r.tag('v9.9.9', a);
    const b = r.commit('two');
    r.tag('v1.2.3-rc1', b, 'rc\n');
    const f = fake();
    assert.deepEqual(await run(r, f, b, 'reject'), []);
    assert.match(f.warnings[0], /no baseline tag/);
  });
});

test('a baseline whose Release is missing is repaired with the baseline subject and empty notes', async () => {
  await withRepo(async (r) => {
    const sha = r.commit('chore: baseline');
    r.tag('v0.1.0', sha, BASELINE);
    const f = fake();
    assert.deepEqual(await run(r, f, sha, 'reject'), [{ sha, action: 'release-repaired', version: '0.1.0' }]);
    assert.deepEqual(f.created, [{ tag: 'v0.1.0', title: 'Baseline — versioning starts here', notes: '' }]);
    assert.deepEqual(await originTags(r), []);
  });
});

test('a cancelled pending run: its commits are released oldest first, each from the version before it', async () => {
  await withRepo(async (r) => {
    const base = r.commit('chore: baseline');
    r.tag('v0.1.0', base, BASELINE);
    const a = r.commit('feat: a (#1)');
    const b = r.commit('docs: b (#2)');
    const c = r.commit('fix: c (#3)');
    const f = fake({
      releases: ['v0.1.0'],
      pulls: {
        [a]: [pr(1, 'feat: a', a)],
        [b]: [pr(2, 'docs: b', b, 'BREAKING CHANGE: ignored on a silent type')],
        [c]: [pr(3, 'fix: c', c)],
      },
    });
    assert.deepEqual(await run(r, f, c, 'reject'), [
      { sha: base, action: 'already-released' },
      { sha: a, action: 'released', version: '0.2.0' },
      { sha: b, action: 'not-releasing' },
      { sha: c, action: 'released', version: '0.2.1' },
    ]);
    assert.deepEqual(await originTags(r), ['v0.2.0', 'v0.2.1']);
    assert.deepEqual(
      f.created.map((x) => [x.tag, x.title]),
      [
        ['v0.2.0', 'feat: a (#1)'],
        ['v0.2.1', 'fix: c (#3)'],
      ],
    );
    assert.equal(await git(r.origin!, ['rev-parse', 'v0.2.0^{commit}']), a);
    assert.equal(await git(r.origin!, ['rev-parse', 'v0.2.1^{commit}']), c);
  });
});

test('running the same target twice changes nothing the second time', async () => {
  await withRepo(async (r) => {
    const base = r.commit('chore: baseline');
    r.tag('v0.1.0', base, BASELINE);
    const a = r.commit('feat: a (#1)');
    const f = fake({ releases: ['v0.1.0'], pulls: { [a]: [pr(1, 'feat: a', a)] } });
    assert.equal((await run(r, f, a, 'reject'))[1].action, 'released');
    const tagsBefore = await originTags(r);
    const createdBefore = f.created.length;
    const prCallsBefore = f.pullCalls.length;

    // The range now starts at the newest tag, which is the target itself.
    assert.deepEqual(await run(r, f, a, 'reject'), [{ sha: a, action: 'already-released' }]);
    assert.deepEqual(await originTags(r), tagsBefore);
    assert.equal(f.created.length, createdBefore);
    assert.equal(f.pullCalls.length, prCallsBefore);
  });
});

test('a tag whose push succeeded but whose Release failed is repaired from its own message on the next run', async () => {
  await withRepo(async (r) => {
    const base = r.commit('chore: baseline');
    r.tag('v0.1.0', base, BASELINE);
    const a = r.commit('feat: a (#1)');
    const body = "## What's new\n\nA thing.\n\n## Why\n\nx";
    const f = fake({ releases: ['v0.1.0'], pulls: { [a]: [pr(1, 'feat: a', a, body)] } });
    const failing: GitHubPort = {
      ...f.port,
      createRelease: () => Promise.reject(new Error('gh down')),
    };
    await assert.rejects(runRelease({ cwd: r.dir, target: a, github: failing, log: log(f), onNewer: 'reject' }), /gh down/);
    assert.deepEqual(await originTags(r), ['v0.2.0']);

    assert.deepEqual(await run(r, f, a, 'reject'), [{ sha: a, action: 'release-repaired', version: '0.2.0' }]);
    assert.deepEqual(f.created, [{ tag: 'v0.2.0', title: 'feat: a (#1)', notes: 'A thing.' }]);
    assert.deepEqual(await originTags(r), ['v0.2.0']);
  });
});

test('a commit with no PR from either source is skipped with a warning and the next commit is still released', async () => {
  await withRepo(async (r) => {
    const base = r.commit('chore: baseline');
    r.tag('v0.1.0', base, BASELINE);
    const direct = r.commit('direct push to main');
    const next = r.commit('fix: n (#5)');
    const f = fake({ releases: ['v0.1.0'], pulls: { [next]: [pr(5, 'fix: n', next)] } });
    assert.deepEqual(await run(r, f, next, 'reject'), [
      { sha: base, action: 'already-released' },
      { sha: direct, action: 'no-pr' },
      { sha: next, action: 'released', version: '0.1.1' },
    ]);
    assert.deepEqual(f.warnings, [`no PR for ${direct}`]);
  });
});

test('an empty pullsForCommit falls back to the (#N) in the subject through getPull', async () => {
  await withRepo(async (r) => {
    const base = r.commit('chore: baseline');
    r.tag('v0.1.0', base, BASELINE);
    const a = r.commit('feat: late (#4)');
    const f = fake({ releases: ['v0.1.0'], byNumber: { 4: pr(4, 'feat: late', a) } });
    assert.deepEqual((await run(r, f, a, 'reject'))[1], { sha: a, action: 'released', version: '0.2.0' });
    assert.deepEqual(f.getPullCalls, [4]);
  });
});

test('an unmerged PR counts as no PR, whether listed for the commit or found through the subject', async () => {
  await withRepo(async (r) => {
    const base = r.commit('chore: baseline');
    r.tag('v0.1.0', base, BASELINE);
    const listed = r.commit('feat: listed (#6)');
    const viaSubject = r.commit('feat: subject (#7)');
    const f = fake({
      releases: ['v0.1.0'],
      pulls: { [listed]: [pr(6, 'feat: listed', listed, null, false)] },
      byNumber: { 6: pr(6, 'feat: listed', listed, null, false), 7: pr(7, 'feat: subject', viaSubject, null, false) },
    });
    assert.deepEqual((await run(r, f, viaSubject, 'reject')).map((x) => x.action), ['already-released', 'no-pr', 'no-pr']);
    assert.deepEqual(await originTags(r), []);
  });
});

test('of several PRs listed for a commit only the one merged as that commit is used', async () => {
  await withRepo(async (r) => {
    const base = r.commit('chore: baseline');
    r.tag('v0.1.0', base, BASELINE);
    const a = r.commit('fix: right (#8)');
    const other = 'f'.repeat(40);
    const f = fake({ releases: ['v0.1.0'], pulls: { [a]: [pr(3, 'feat: other', other), pr(8, 'fix: right', a)] } });
    assert.deepEqual((await run(r, f, a, 'reject'))[1], { sha: a, action: 'released', version: '0.1.1' });
    assert.equal(f.created[0].title, 'fix: right (#8)');
  });
});

test('a target older than a commit carrying a version tag rejects and pushes nothing', async () => {
  await withRepo(async (r) => {
    const base = r.commit('chore: baseline');
    r.tag('v0.1.0', base, BASELINE);
    const old = r.commit('feat: old (#1)');
    const later = r.commit('feat: later (#2)');
    r.tag('v0.2.0', later, formatTagMessage({ title: 'feat: later', pr: 2, notes: '', type: 'feat', breaking: false }));
    const f = fake({ releases: ['v0.1.0'], pulls: { [old]: [pr(1, 'feat: old', old)] } });
    await assert.rejects(run(r, f, old, 'reject'), /a newer release exists: v0\.2\.0/);
    assert.deepEqual(await originTags(r), []);
    assert.deepEqual(f.created, []);
  });
});

test('onNewer skip: the same superseded target resolves to [] with an info line, pushes nothing and never calls the port', async () => {
  await withRepo(async (r) => {
    const base = r.commit('chore: baseline');
    r.tag('v0.1.0', base, BASELINE);
    const old = r.commit('feat: old (#1)');
    const later = r.commit('feat: later (#2)');
    r.tag('v0.2.0', later, formatTagMessage({ title: 'feat: later', pr: 2, notes: '', type: 'feat', breaking: false }));
    const f = fake({ releases: ['v0.1.0'], pulls: { [old]: [pr(1, 'feat: old', old)] } });
    assert.deepEqual(await run(r, f, old, 'skip'), []);
    assert.deepEqual(f.infos, ['a newer release exists: v0.2.0 — nothing to do']);
    assert.deepEqual(f.warnings, []);
    assert.deepEqual(await originTags(r), []);
    assert.equal(f.portCalls, 0);
  });
});

test('an annotated tag on a side branch that is not a descendant of the target does not trip the guard', async () => {
  await withRepo(async (r) => {
    const base = r.commit('chore: baseline');
    r.tag('v0.1.0', base, BASELINE);
    await git(r.dir, ['checkout', '-q', '-b', 'side']);
    const sideSha = r.commit('feat: side (#9)');
    r.tag('v0.9.0', sideSha, formatTagMessage({ title: 'feat: side', pr: 9, notes: '', type: 'feat', breaking: false }));
    await git(r.dir, ['checkout', '-q', 'main']);
    const a = r.commit('feat: a (#1)');
    const f = fake({ releases: ['v0.1.0'], pulls: { [a]: [pr(1, 'feat: a', a)] } });
    assert.deepEqual((await run(r, f, a, 'reject'))[1], { sha: a, action: 'released', version: '0.2.0' });
    assert.deepEqual(await originTags(r), ['v0.2.0']);
  });
});

test('a lightweight v9.9.9 on the baseline commit is not the base version', async () => {
  await withRepo(async (r) => {
    const base = r.commit('chore: baseline');
    r.tag('v0.1.0', base, BASELINE);
    r.tag('v9.9.9', base);
    const a = r.commit('feat: a (#1)');
    const f = fake({ releases: ['v0.1.0'], pulls: { [a]: [pr(1, 'feat: a', a)] } });
    assert.deepEqual((await run(r, f, a, 'reject'))[1], { sha: a, action: 'released', version: '0.2.0' });
  });
});

test('the released tag message is formatTagMessage of the PR, and its notes keep lines that start with #', async () => {
  await withRepo(async (r) => {
    const base = r.commit('chore: baseline');
    r.tag('v0.1.0', base, BASELINE);
    const a = r.commit('feat(api)!: reshape (#12)');
    const body = "## What's new\n\nReshaped.\n#12 is the tracking issue\n### Detail\n\nmore\n\n## Verification\n\nignored\n\nBREAKING CHANGE: field renamed";
    const title = 'feat(api)!: reshape';
    const f = fake({ releases: ['v0.1.0'], pulls: { [a]: [pr(12, title, a, body)] } });
    assert.deepEqual((await run(r, f, a, 'reject'))[1], { sha: a, action: 'released', version: '0.2.0' });

    const expected = formatTagMessage({
      title,
      pr: 12,
      notes: extractWhatsNew(body),
      type: 'feat',
      scope: 'api',
      breaking: isBreaking(checkTitle(title), body),
    });
    assert.equal(await originMessage(r, 'v0.2.0'), expected.trimEnd());
    assert.deepEqual(f.created, [{ tag: 'v0.2.0', title: 'feat(api)!: reshape (#12)', notes: extractWhatsNew(body) }]);
    assert.match(expected, /^#12 is the tracking issue$/m);
  });
});
