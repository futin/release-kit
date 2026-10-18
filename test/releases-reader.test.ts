import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createReleasesReader, defaultGitPort, findRepoRoot, formatTagMessage, readReleases } from '../src/index.js';
import type { GitPort } from '../src/index.js';
import { makeRepo } from './fixtures/repo.js';
import type { TestRepo } from './fixtures/repo.js';

const BASELINE = 'Baseline — versioning starts here\n';
const EMPTY = { current: null, releases: [] };
const feat = (title: string, pr: number) => formatTagMessage({ title, pr, notes: '', type: 'feat', breaking: false });

/** The real git behind a port that records every argv, answering `null` for any subcommand named in `fail`. A "read" is one `for-each-ref` launch. */
function recording(fail: string[] = []): { port: GitPort; calls: string[][]; reads(): number } {
  const real = defaultGitPort();
  const calls: string[][] = [];
  const port: GitPort = async (args, o) => {
    calls.push(args);
    return fail.includes(args[0]) ? null : real(args, o);
  };
  return { port, calls, reads: () => calls.filter((a) => a[0] === 'for-each-ref').length };
}

/** A repo with a baseline release on its only commit. */
function released(): TestRepo {
  const r = makeRepo();
  r.tag('v0.1.0', r.commit('base'), BASELINE);
  return r;
}

test('two sequential reads under one key launch one read', async () => {
  const r = released();
  try {
    const rec = recording();
    const reader = createReleasesReader({ root: r.dir, git: rec.port });
    const first = await reader.read();
    assert.deepEqual(await reader.read(), first);
    assert.deepEqual(first.current, { version: '0.1.0', ahead: 0 });
    assert.equal(rec.reads(), 1);
  } finally {
    r.cleanup();
  }
});

test('two concurrent reads under one key share one read', async () => {
  const r = released();
  try {
    const rec = recording();
    const reader = createReleasesReader({ root: r.dir, git: rec.port });
    const [a, b] = await Promise.all([reader.read(), reader.read()]);
    assert.deepEqual(a, b);
    assert.equal(rec.reads(), 1);
  } finally {
    r.cleanup();
  }
});

test('a commit after the first read re-reads and moves ahead', async () => {
  const r = released();
  try {
    const rec = recording();
    const reader = createReleasesReader({ root: r.dir, git: rec.port });
    assert.equal((await reader.read()).current?.ahead, 0);
    r.commit('next');
    assert.equal((await reader.read()).current?.ahead, 1);
    assert.equal(rec.reads(), 2);
  } finally {
    r.cleanup();
  }
});

test('an annotated tag cut on an old commit without moving HEAD re-reads', async () => {
  const r = makeRepo();
  try {
    const old = r.commit('old');
    r.tag('v0.1.0', old, BASELINE);
    r.commit('head');
    const rec = recording();
    const reader = createReleasesReader({ root: r.dir, git: rec.port });
    assert.deepEqual((await reader.read()).releases.map((x) => x.version), ['0.1.0']);
    r.tag('v0.2.0', old, feat('late', 3));
    assert.deepEqual((await reader.read()).releases.map((x) => x.version).sort(), ['0.1.0', '0.2.0']);
    assert.equal(rec.reads(), 2);
  } finally {
    r.cleanup();
  }
});

test('git pack-refs --all after the first read re-reads', async () => {
  const r = released();
  try {
    const rec = recording();
    const reader = createReleasesReader({ root: r.dir, git: rec.port });
    await reader.read();
    await defaultGitPort()(['pack-refs', '--all'], { cwd: r.dir });
    assert.ok(existsSync(join(r.dir, '.git', 'packed-refs')));
    await reader.read();
    assert.equal(rec.reads(), 2);
  } finally {
    r.cleanup();
  }
});

// Every git ref update also takes a lock file in refs/tags, so only a direct rewrite shows the packed-refs half of the key on its own.
test('packed-refs rewritten without touching refs/tags re-reads', async () => {
  const r = released();
  try {
    r.tag('v0.2.0', r.commit('next'), feat('two', 2));
    await defaultGitPort()(['pack-refs', '--all'], { cwd: r.dir });
    const rec = recording();
    const reader = createReleasesReader({ root: r.dir, git: rec.port });
    assert.equal((await reader.read()).releases.length, 2);
    const packed = join(r.dir, '.git', 'packed-refs');
    const kept = readFileSync(packed, 'utf8').split('\n');
    const at = kept.findIndex((l) => l.endsWith(' refs/tags/v0.2.0'));
    // The tag's line and the peeled `^<sha>` line after it.
    kept.splice(at, 2);
    writeFileSync(packed, kept.join('\n'));
    assert.deepEqual((await reader.read()).releases.map((x) => x.version), ['0.1.0']);
    assert.equal(rec.reads(), 2);
  } finally {
    r.cleanup();
  }
});

test('an incomplete answer (describe failing) is not memoised', async () => {
  const r = released();
  try {
    const rec = recording(['describe']);
    const reader = createReleasesReader({ root: r.dir, git: rec.port });
    assert.equal((await reader.read()).current, null);
    await reader.read();
    assert.equal(rec.reads(), 2);
  } finally {
    r.cleanup();
  }
});

test('a tagless checkout is a complete empty answer and is memoised', async () => {
  const r = makeRepo();
  try {
    r.commit('one');
    const rec = recording();
    const reader = createReleasesReader({ root: r.dir, git: rec.port });
    assert.deepEqual(await reader.read(), EMPTY);
    assert.deepEqual(await reader.read(), EMPTY);
    assert.equal(rec.reads(), 1);
  } finally {
    r.cleanup();
  }
});

test('one commit with no packed-refs and no refs/tags still builds a key and memoises', async () => {
  const r = makeRepo();
  try {
    r.commit('one');
    rmSync(join(r.dir, '.git', 'refs', 'tags'), { recursive: true, force: true });
    assert.ok(!existsSync(join(r.dir, '.git', 'packed-refs')));
    const rec = recording();
    const reader = createReleasesReader({ root: r.dir, git: rec.port });
    assert.deepEqual(await reader.read(), EMPTY);
    assert.deepEqual(await reader.read(), EMPTY);
    assert.equal(rec.reads(), 1);
  } finally {
    r.cleanup();
  }
});

test('a root function returning null answers the empty shape and never calls the port', async () => {
  const rec = recording();
  const reader = createReleasesReader({ root: () => null, git: rec.port });
  assert.deepEqual(await reader.read(), EMPTY);
  assert.equal(rec.calls.length, 0);
});

test('a root function is read on every call', async () => {
  const a = released();
  const b = makeRepo();
  const prev = process.env.RELEASE_KIT_TEST_ROOT;
  try {
    b.tag('v2.0.0', b.commit('b'), BASELINE);
    const reader = createReleasesReader({ root: () => process.env.RELEASE_KIT_TEST_ROOT ?? null });
    process.env.RELEASE_KIT_TEST_ROOT = a.dir;
    assert.equal((await reader.read()).current?.version, '0.1.0');
    process.env.RELEASE_KIT_TEST_ROOT = b.dir;
    assert.equal((await reader.read()).current?.version, '2.0.0');
  } finally {
    if (prev === undefined) delete process.env.RELEASE_KIT_TEST_ROOT;
    else process.env.RELEASE_KIT_TEST_ROOT = prev;
    a.cleanup();
    b.cleanup();
  }
});

test('a linked worktree root reads the main checkout and keys on its common dir', async () => {
  const r = released();
  try {
    const wt = r.worktree(mkdtempSync(join(tmpdir(), 'release-kit-wt-')));
    const rec = recording();
    const reader = createReleasesReader({ root: wt, git: rec.port });
    assert.deepEqual((await reader.read()).releases.map((x) => x.version), ['0.1.0']);
    await reader.read();
    assert.equal(rec.reads(), 1);
    r.tag('v0.2.0', r.commit('main only'), feat('from main', 4));
    assert.deepEqual((await reader.read()).releases.map((x) => x.version), ['0.2.0', '0.1.0']);
    assert.equal(rec.reads(), 2);
  } finally {
    r.cleanup();
  }
});

test('rev-parse failing serves the answer without memoising it', async () => {
  const r = released();
  try {
    const rec = recording(['rev-parse']);
    const reader = createReleasesReader({ root: r.dir, git: rec.port });
    assert.deepEqual(await reader.read(), await readReleases(r.dir));
    await reader.read();
    assert.equal(rec.reads(), 2);
  } finally {
    r.cleanup();
  }
});

test('findRepoRoot finds the nearest .git entry, directory or file', () => {
  const r = released();
  try {
    const nested = join(r.dir, 'a', 'b');
    mkdirSync(nested, { recursive: true });
    assert.equal(findRepoRoot(nested), r.dir);
    assert.equal(findRepoRoot(r.dir), r.dir);
    const wt = r.worktree(mkdtempSync(join(tmpdir(), 'release-kit-wt-')));
    const sub = join(wt, 'x');
    mkdirSync(sub);
    assert.equal(findRepoRoot(sub), wt);
    assert.equal(findRepoRoot('/'), null);
  } finally {
    r.cleanup();
  }
});
