import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatTagMessage, readReleases, writeReleasesJson } from '../src/index.js';
import { git, versionTags, versionTagsAt } from '../src/git.js';
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
