import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { bumpConsumer, main } from '../scripts/bump-consumer.mjs';

const VERSIONS = ['v0.3.0', 'v0.2.0', 'v0.1.0'];
const BRANCH = 'bump/ui-kit-v0.3.0';

// A consumer checkout: a temp dir holding package.json and, optionally, a lockfile.
function consumerDir({ pkgJson, lockfile } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'bump-consumer-'));
  const json =
    pkgJson ??
    '{\n  "name": "x",\n  "version": "1.0.0",\n  "dependencies": {\n    "react": "^19.0.0",\n    "ui-kit": "github:futin/ui-kit#v0.1.0"\n  }\n}\n';
  writeFileSync(path.join(dir, 'package.json'), json);
  if (lockfile) writeFileSync(path.join(dir, lockfile), '');
  return dir;
}

// A fake `run` that records every call and answers `gh` from a script:
// `prs` maps a head branch to the PRs `gh pr list --head <branch> --state all` returns,
// `open` is what `gh pr list --state open` returns, `created` is the number `gh pr create` reports.
function fakeRun({ prs = {}, open = [], created = 57, ghStatus = 0 } = {}) {
  const calls = [];
  const run = async (cmd, args, opts) => {
    calls.push({ cmd, args, opts });
    if (cmd !== 'gh') return { code: 0, stdout: '' };
    if (ghStatus === 401) return { code: 1, stdout: '', stderr: 'HTTP 401: Bad credentials (https://api.github.com/graphql)\n' };
    if (args[0] === 'pr' && args[1] === 'list') {
      const head = args[args.indexOf('--head') + 1];
      if (args.includes('--head')) return { code: 0, stdout: JSON.stringify(prs[head] ?? []) };
      return { code: 0, stdout: JSON.stringify(open) };
    }
    if (args[0] === 'pr' && args[1] === 'create') return { code: 0, stdout: `https://github.com/futin/x/pull/${created}\n` };
    return { code: 0, stdout: '' };
  };
  return { run, calls };
}

const base = { pkg: 'ui-kit', repository: 'futin/ui-kit', consumer: 'futin/x', version: 'v0.3.0', versions: VERSIONS };

const find = (calls, cmd, ...prefix) => calls.filter((c) => c.cmd === cmd && prefix.every((p, i) => c.args[i] === p));
const pushes = (calls) => find(calls, 'git', 'push');
const creates = (calls) => find(calls, 'gh', 'pr', 'create');
const closes = (calls) => find(calls, 'gh', 'pr', 'close');
const flag = (call, name) => call.args[call.args.indexOf(name) + 1];

test('already pinned at the newest version: pinned, no push, no PR', async () => {
  const dir = consumerDir({ pkgJson: '{"dependencies":{"ui-kit":"github:futin/ui-kit#v0.3.0"}}\n' });
  const { run, calls } = fakeRun();
  const r = await bumpConsumer({ ...base, dir, run });
  assert.equal(r.outcome, 'pinned');
  assert.deepEqual(r.closed, []);
  assert.equal(pushes(calls).length, 0);
  assert.equal(creates(calls).length, 0);
});

test('an open PR on the bump branch: open, no push', async () => {
  const dir = consumerDir();
  const { run, calls } = fakeRun({ prs: { [BRANCH]: [{ number: 12, state: 'OPEN' }] } });
  const r = await bumpConsumer({ ...base, dir, run });
  assert.equal(r.outcome, 'open');
  assert.equal(r.pr, 12);
  assert.equal(pushes(calls).length, 0);
  assert.equal(creates(calls).length, 0);
});

test('a closed unmerged PR on the bump branch (declined): closed, no push, no create', async () => {
  const dir = consumerDir();
  const { run, calls } = fakeRun({ prs: { [BRANCH]: [{ number: 13, state: 'CLOSED' }] } });
  const r = await bumpConsumer({ ...base, dir, run });
  assert.equal(r.outcome, 'closed');
  assert.equal(r.pr, 13);
  assert.equal(pushes(calls).length, 0);
  assert.equal(creates(calls).length, 0);
});

test('a merged PR on the bump branch: closed, no push', async () => {
  const dir = consumerDir();
  const { run, calls } = fakeRun({ prs: { [BRANCH]: [{ number: 14, state: 'MERGED' }] } });
  const r = await bumpConsumer({ ...base, dir, run });
  assert.equal(r.outcome, 'closed');
  assert.equal(pushes(calls).length, 0);
  assert.equal(creates(calls).length, 0);
});

test('branch already on the remote with no PR: force-pushed, PR opened', async () => {
  const dir = consumerDir({ lockfile: 'package-lock.json' });
  const { run, calls } = fakeRun({ created: 21 });
  const r = await bumpConsumer({ ...base, dir, run });
  assert.equal(r.outcome, 'opened');
  assert.equal(r.pr, 21);
  const [push] = pushes(calls);
  assert.ok(push, 'pushed');
  assert.ok(push.args.includes('--force'), `push is --force: ${push.args.join(' ')}`);
  assert.ok(push.args.includes(BRANCH));
  assert.equal(creates(calls).length, 1);
});

test('behind with nothing open: package.json rewritten in place, formatting kept', async () => {
  const before =
    '{\n    "name": "x",\n    "scripts": { "dev": "vite" },\n    "dependencies": {\n        "react": "^19.0.0",\n        "ui-kit": "github:futin/ui-kit#v0.1.0"\n    }\n}\n';
  const dir = consumerDir({ pkgJson: before, lockfile: 'pnpm-lock.yaml' });
  const { run } = fakeRun();
  await bumpConsumer({ ...base, dir, run });
  const after = readFileSync(path.join(dir, 'package.json'), 'utf8');
  assert.equal(after, before.replace('github:futin/ui-kit#v0.1.0', 'github:futin/ui-kit#v0.3.0'));
});

test('a pnpm-lock.yaml consumer: pnpm install --lockfile-only, after corepack enable', async () => {
  const dir = consumerDir({ lockfile: 'pnpm-lock.yaml' });
  const { run, calls } = fakeRun();
  await bumpConsumer({ ...base, dir, run });
  const order = calls.map((c) => [c.cmd, ...c.args].join(' '));
  const pnpm = order.indexOf('pnpm install --lockfile-only');
  assert.ok(pnpm >= 0, order.join('\n'));
  assert.ok(order.indexOf('corepack enable') >= 0 && order.indexOf('corepack enable') < pnpm);
  assert.equal(find(calls, 'npm').length, 0);
  assert.equal(calls[order.indexOf('pnpm install --lockfile-only')].opts?.cwd, dir);
});

test('a package-lock.json consumer: npm install --package-lock-only', async () => {
  const dir = consumerDir({ lockfile: 'package-lock.json' });
  const { run, calls } = fakeRun();
  await bumpConsumer({ ...base, dir, run });
  const npm = find(calls, 'npm', 'install');
  assert.equal(npm.length, 1);
  assert.deepEqual(npm[0].args, ['install', '--package-lock-only']);
  assert.equal(find(calls, 'pnpm').length, 0);
});

test('behind with nothing open: bot commit, force-push, PR title and body', async () => {
  const dir = consumerDir({ lockfile: 'pnpm-lock.yaml' });
  const { run, calls } = fakeRun();
  const r = await bumpConsumer({ ...base, dir, run });
  assert.equal(r.outcome, 'opened');

  const commit = calls.find((c) => c.cmd === 'git' && c.args.includes('commit'));
  assert.ok(commit, 'committed');
  const line = commit.args.join(' ');
  assert.match(line, /user\.name=github-actions\[bot\]/);
  assert.match(line, /user\.email=41898282\+github-actions\[bot\]@users\.noreply\.github\.com/);
  const added = calls.find((c) => c.cmd === 'git' && c.args[0] === 'add');
  assert.deepEqual(added.args.slice(1).sort(), ['package.json', 'pnpm-lock.yaml']);

  assert.ok(pushes(calls)[0].args.includes('--force'));

  const [create] = creates(calls);
  assert.equal(flag(create, '--title'), 'chore(deps): bump ui-kit to v0.3.0');
  assert.equal(flag(create, '--head'), BRANCH);
  assert.equal(flag(create, '--repo'), 'futin/x');
  const body = flag(create, '--body');
  assert.match(body, /retitle/i);
  assert.match(body, /After merge/);
  assert.match(body, /node_modules/);
  const links = body.match(/https:\/\/github\.com\/\S+/g);
  assert.deepEqual(links, [
    'https://github.com/futin/ui-kit/releases/tag/v0.3.0',
    'https://github.com/futin/ui-kit/releases/tag/v0.2.0',
  ]);
});

test('commit message is the PR title', async () => {
  const dir = consumerDir();
  const { run, calls } = fakeRun();
  await bumpConsumer({ ...base, dir, run });
  const commit = calls.find((c) => c.cmd === 'git' && c.args.includes('commit'));
  assert.equal(flag(commit, '-m'), 'chore(deps): bump ui-kit to v0.3.0');
});

test('dependency under devDependencies: updated there', async () => {
  const before = '{\n  "name": "x",\n  "devDependencies": {\n    "ui-kit": "github:futin/ui-kit#v0.2.0"\n  }\n}\n';
  const dir = consumerDir({ pkgJson: before });
  const { run, calls } = fakeRun();
  const r = await bumpConsumer({ ...base, dir, run });
  assert.equal(r.outcome, 'opened');
  assert.equal(readFileSync(path.join(dir, 'package.json'), 'utf8'), before.replace('#v0.2.0', '#v0.3.0'));
  const links = flag(creates(calls)[0], '--body').match(/https:\/\/github\.com\/\S+/g);
  assert.deepEqual(links, ['https://github.com/futin/ui-kit/releases/tag/v0.3.0']);
});

test('the same name in a different section is left alone', async () => {
  const before =
    '{\n  "peerDependencies": {\n    "ui-kit": "github:futin/ui-kit#v0.1.0"\n  },\n  "devDependencies": {\n    "ui-kit": "github:futin/ui-kit#v0.1.0"\n  }\n}\n';
  const dir = consumerDir({ pkgJson: before });
  const { run } = fakeRun();
  await bumpConsumer({ ...base, dir, run });
  const after = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8'));
  assert.equal(after.peerDependencies['ui-kit'], 'github:futin/ui-kit#v0.1.0');
  assert.equal(after.devDependencies['ui-kit'], 'github:futin/ui-kit#v0.3.0');
});

test('dependency absent: missing with the exact warning, no branch', async () => {
  const dir = consumerDir({ pkgJson: '{"dependencies":{"react":"^19.0.0"}}\n' });
  const { run, calls } = fakeRun();
  const r = await bumpConsumer({ ...base, dir, run });
  assert.equal(r.outcome, 'missing');
  assert.equal(r.warning, 'futin/x does not depend on ui-kit yet');
  assert.equal(find(calls, 'git').length, 0);
  assert.equal(creates(calls).length, 0);
});

test('CLI: missing prints a ::warning:: and exits 0', async () => {
  const dir = consumerDir({ pkgJson: '{"dependencies":{}}\n' });
  const { run } = fakeRun();
  const out = [];
  const code = await main({
    env: { PKG: 'ui-kit', REPOSITORY: 'futin/ui-kit', CONSUMER: 'futin/x', VERSION: 'v0.3.0', VERSIONS: VERSIONS.join(' '), GH_TOKEN: 't' },
    cwd: dir,
    run,
    log: (s) => out.push(s),
    error: (s) => out.push(s),
  });
  assert.equal(code, 0);
  assert.ok(out.includes('::warning::futin/x does not depend on ui-kit yet'), out.join('\n'));
});

test('an older open bump PR is closed when a new PR is opened, naming it', async () => {
  const dir = consumerDir();
  const { run, calls } = fakeRun({ open: [{ number: 9, headRefName: 'bump/ui-kit-v0.2.0' }], created: 30 });
  const r = await bumpConsumer({ ...base, dir, run });
  assert.equal(r.outcome, 'opened');
  assert.deepEqual(r.closed, [9]);
  const [close] = closes(calls);
  assert.equal(close.args[2], '9');
  assert.equal(flag(close, '--repo'), 'futin/x');
  assert.match(flag(close, '--comment'), /#30\b/);
});

test('already pinned with an older bump PR open: closed saying the consumer is on the newest', async () => {
  const dir = consumerDir({ pkgJson: '{"dependencies":{"ui-kit":"github:futin/ui-kit#v0.3.0"}}\n' });
  const { run, calls } = fakeRun({ open: [{ number: 9, headRefName: 'bump/ui-kit-v0.2.0' }] });
  const r = await bumpConsumer({ ...base, dir, run });
  assert.equal(r.outcome, 'pinned');
  assert.deepEqual(r.closed, [9]);
  assert.match(flag(closes(calls)[0], '--comment'), /already on v0\.3\.0/);
  assert.equal(creates(calls).length, 0);
});

test('current PR already open with an older bump PR open: the older one is closed', async () => {
  const dir = consumerDir();
  const { run, calls } = fakeRun({
    prs: { [BRANCH]: [{ number: 12, state: 'OPEN' }] },
    open: [
      { number: 12, headRefName: BRANCH },
      { number: 9, headRefName: 'bump/ui-kit-v0.2.0' },
    ],
  });
  const r = await bumpConsumer({ ...base, dir, run });
  assert.equal(r.outcome, 'open');
  assert.deepEqual(r.closed, [9]);
  assert.match(flag(closes(calls)[0], '--comment'), /#12\b/);
});

test('an open bump PR for a newer version than the newest is left open, and other heads are ignored', async () => {
  const dir = consumerDir();
  const { run, calls } = fakeRun({
    open: [
      { number: 40, headRefName: 'bump/ui-kit-v0.4.0' },
      { number: 41, headRefName: 'bump/release-kit-v0.1.0' },
      { number: 42, headRefName: 'feature/bump/ui-kit-v0.1.0' },
    ],
  });
  const r = await bumpConsumer({ ...base, dir, run });
  assert.equal(r.outcome, 'opened');
  assert.deepEqual(r.closed, []);
  assert.equal(closes(calls).length, 0);
});

test('CLI: gh answering 401 exits 1 naming BUMP_TOKEN', async () => {
  const dir = consumerDir();
  const { run } = fakeRun({ ghStatus: 401 });
  const out = [];
  const code = await main({
    env: { PKG: 'ui-kit', REPOSITORY: 'futin/ui-kit', CONSUMER: 'futin/x', VERSION: 'v0.3.0', VERSIONS: VERSIONS.join(' '), GH_TOKEN: 'expired' },
    cwd: dir,
    run,
    log: (s) => out.push(s),
    error: (s) => out.push(s),
  });
  assert.equal(code, 1);
  assert.match(out.join('\n'), /BUMP_TOKEN/);
});

test('CLI: GH_TOKEN unset exits 1 naming BUMP_TOKEN without running anything', async () => {
  const { run, calls } = fakeRun();
  const out = [];
  const code = await main({
    env: { PKG: 'ui-kit', REPOSITORY: 'futin/ui-kit', CONSUMER: 'futin/x', VERSION: 'v0.3.0', VERSIONS: 'v0.3.0' },
    cwd: consumerDir(),
    run,
    log: (s) => out.push(s),
    error: (s) => out.push(s),
  });
  assert.equal(code, 1);
  assert.match(out.join('\n'), /BUMP_TOKEN/);
  assert.equal(calls.length, 0);
});

test('CLI: a failed non-gh command exits 1 with the command named', async () => {
  const dir = consumerDir({ lockfile: 'pnpm-lock.yaml' });
  const { run: inner } = fakeRun();
  const run = async (cmd, args, opts) => (cmd === 'pnpm' ? { code: 1, stdout: '', stderr: 'ERR_PNPM_X boom' } : inner(cmd, args, opts));
  const out = [];
  const code = await main({
    env: { PKG: 'ui-kit', REPOSITORY: 'futin/ui-kit', CONSUMER: 'futin/x', VERSION: 'v0.3.0', VERSIONS: 'v0.3.0', GH_TOKEN: 't' },
    cwd: dir,
    run,
    log: (s) => out.push(s),
    error: (s) => out.push(s),
  });
  assert.equal(code, 1);
  assert.match(out.join('\n'), /pnpm install --lockfile-only/);
});

const merges = (calls) => find(calls, 'gh', 'pr', 'merge');

test('autoMerge off (the default): no gh pr merge, body says nothing of auto-merge', async () => {
  const { run, calls } = fakeRun();
  const r = await bumpConsumer({ ...base, dir: consumerDir(), run });
  assert.equal(r.outcome, 'opened');
  assert.equal(merges(calls).length, 0);
  assert.doesNotMatch(flag(creates(calls)[0], '--body'), /auto-merge/i);
});

test('autoMerge on, PR opened: auto-merge enabled on that PR as a squash, after the create', async () => {
  const { run, calls } = fakeRun({ created: 64 });
  const r = await bumpConsumer({ ...base, dir: consumerDir(), run, autoMerge: true });
  assert.equal(r.outcome, 'opened');
  assert.equal(r.warning, undefined);
  const [merge] = merges(calls);
  assert.ok(merge, 'no gh pr merge');
  assert.equal(merge.args[2], '64');
  assert.equal(flag(merge, '--repo'), 'futin/x');
  assert.ok(merge.args.includes('--auto'), `merge is --auto: ${merge.args.join(' ')}`);
  assert.ok(merge.args.includes('--squash'), `merge is --squash: ${merge.args.join(' ')}`);
  assert.ok(calls.indexOf(merge) > calls.indexOf(creates(calls)[0]));
});

test('autoMerge on: the body says how to stop the merge before retitling or declining', async () => {
  const { run, calls } = fakeRun();
  await bumpConsumer({ ...base, dir: consumerDir(), run, autoMerge: true });
  const body = flag(creates(calls)[0], '--body');
  assert.match(body, /auto-merge/i);
  assert.match(body, /Disable auto-merge/);
  assert.match(body, /retitle/i);
});

test('autoMerge on, PR already open: auto-merge is not touched (a human may have disabled it)', async () => {
  const { run, calls } = fakeRun({ prs: { [BRANCH]: [{ number: 40, state: 'OPEN' }] } });
  const r = await bumpConsumer({ ...base, dir: consumerDir(), run, autoMerge: true });
  assert.equal(r.outcome, 'open');
  assert.equal(merges(calls).length, 0);
});

test('autoMerge on, repo disallows it: PR still opened, warning names the setting and apply-repo-settings.sh', async () => {
  const { run: inner, calls } = fakeRun({ created: 64 });
  const run = async (cmd, args, opts) =>
    cmd === 'gh' && args[1] === 'merge'
      ? (calls.push({ cmd, args, opts }), { code: 1, stdout: '', stderr: 'GraphQL: Auto merge is not allowed for this repository (enablePullRequestAutoMerge)' })
      : inner(cmd, args, opts);
  const r = await bumpConsumer({ ...base, dir: consumerDir(), run, autoMerge: true });
  assert.equal(r.outcome, 'opened');
  assert.equal(r.pr, 64);
  assert.match(r.warning, /#64/);
  assert.match(r.warning, /Allow auto-merge/);
  assert.match(r.warning, /apply-repo-settings\.sh/);
  assert.match(r.warning, /not allowed for this repository/);
});

test('CLI: AUTO_MERGE=true enables auto-merge; unset or any other value leaves it off', async () => {
  const env = { PKG: 'ui-kit', REPOSITORY: 'futin/ui-kit', CONSUMER: 'futin/x', VERSION: 'v0.3.0', VERSIONS: 'v0.3.0', GH_TOKEN: 't' };
  for (const [value, expected] of [['true', 1], [undefined, 0], ['false', 0], ['yes', 0]]) {
    const { run, calls } = fakeRun();
    const code = await main({ env: { ...env, ...(value === undefined ? {} : { AUTO_MERGE: value }) }, cwd: consumerDir(), run, log: () => {}, error: () => {} });
    assert.equal(code, 0);
    assert.equal(merges(calls).length, expected, `AUTO_MERGE=${value}`);
  }
});
