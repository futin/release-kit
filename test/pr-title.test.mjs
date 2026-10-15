import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { checkTitle } from '../scripts/pr-title.mjs';

const CLI = fileURLToPath(new URL('../scripts/pr-title.mjs', import.meta.url));

const passing = [
  ['feat: add x', 'feat', undefined, false],
  ['fix(api): guard y', 'fix', 'api', false],
  ['perf(scan)!: drop z', 'perf', 'scan', true],
  ['docs: spec', 'docs', undefined, false],
  ['chore: bump', 'chore', undefined, false],
  ['test(scan): cover z', 'test', 'scan', false],
  ['refactor: split x', 'refactor', undefined, false],
  ['build: pnpm 12', 'build', undefined, false],
  ['ci(release): add workflow', 'ci', 'release', false],
];

for (const [title, type, scope, breaking] of passing) {
  test(`accepts ${JSON.stringify(title)}`, () => {
    const r = checkTitle(title);
    assert.equal(r.ok, true, r.reason);
    assert.equal(r.type, type);
    assert.equal(r.scope, scope);
    assert.equal(r.breaking, breaking);
  });
}

const failing = [
  ['feat add x', 'missing colon'],
  ['Feat: x', 'uppercase type'],
  ['feat:x', 'no space after colon'],
  ['feat: ', 'empty description'],
  ['feat:    ', 'whitespace-only description'],
  ['feat(API): x', 'uppercase scope'],
  ['style: x', 'unknown type'],
  ['Revert "feat: x"', 'GitHub revert title'],
  ['', 'empty title'],
];

for (const [title, why] of failing) {
  test(`rejects ${JSON.stringify(title)} (${why})`, () => {
    const r = checkTitle(title);
    assert.equal(r.ok, false);
    assert.equal(typeof r.reason, 'string');
    assert.ok(r.reason.length > 0);
  });
}

test('rejects ! on a non-releasing type, naming the rule', () => {
  const r = checkTitle('chore!: drop node 18');
  assert.equal(r.ok, false);
  assert.match(r.reason, /!/);
  assert.match(r.reason, /feat\|fix\|perf/);
});

test('CLI treats a hostile title as literal text', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'pr-title-'));
  const marker = path.join(dir, 'pwned');
  const r = spawnSync(process.execPath, [CLI], {
    env: { ...process.env, PR_TITLE: `feat: $(touch ${marker}) \`touch ${marker}\`` },
    encoding: 'utf8',
  });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /^ok: feat/);
  assert.equal(existsSync(marker), false);
});

test('CLI exits 1 on a bad title and prints the reason', () => {
  const r = spawnSync(process.execPath, [CLI], { env: { ...process.env, PR_TITLE: 'style: x' }, encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.ok((r.stdout + r.stderr).trim().length > 0);
});

test('CLI exits 1 naming PR_TITLE when it is unset', () => {
  const env = { ...process.env };
  delete env.PR_TITLE;
  const r = spawnSync(process.execPath, [CLI], { env, encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.match(r.stdout + r.stderr, /PR_TITLE/);
});
