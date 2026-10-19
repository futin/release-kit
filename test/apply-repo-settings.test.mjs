import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, copyFileSync, existsSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SCRIPT = path.join(ROOT, 'scripts/apply-repo-settings.sh');
const FAKE = path.join(ROOT, 'test/fixtures/fake-gh.sh');

const MERGE_FIELDS = [
  '-F allow_squash_merge=true',
  '-F allow_merge_commit=false',
  '-F allow_rebase_merge=false',
  '-F delete_branch_on_merge=true',
  '-F allow_auto_merge=true',
  '-f squash_merge_commit_title=PR_TITLE',
  '-f squash_merge_commit_message=PR_BODY',
];

function whichSync(tool) {
  const r = spawnSync('sh', ['-c', `command -v ${tool}`], { encoding: 'utf8' });
  assert.equal(r.status, 0, `${tool} not found`);
  return r.stdout.trim();
}

function run(args, { rulesets = '[]', cwd = ROOT, withGh = true } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'fake-gh-'));
  const log = path.join(dir, 'calls.log');
  let PATH;
  if (withGh) {
    copyFileSync(FAKE, path.join(dir, 'gh'));
    PATH = `${dir}:${process.env.PATH}`;
  } else {
    // A PATH holding only what the script needs before its gh check — never /usr/bin, where GitHub runners install the real gh.
    const bin = path.join(dir, 'bin');
    mkdirSync(bin);
    for (const tool of ['dirname', 'basename']) symlinkSync(whichSync(tool), path.join(bin, tool));
    symlinkSync(process.execPath, path.join(bin, 'node'));
    PATH = bin;
  }
  const r = spawnSync(whichSync('bash'), [SCRIPT, ...args], {
    cwd,
    env: { ...process.env, PATH, FAKE_GH_LOG: log, FAKE_GH_RULESETS: rulesets },
    encoding: 'utf8',
  });
  const calls = existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n').filter(Boolean) : [];
  return { ...r, calls };
}

test('no existing ruleset: PATCH settings, list rulesets, POST the ruleset', () => {
  const r = run(['o/r']);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.calls.length, 3, r.calls.join('\n'));
  const [patch, list, post] = r.calls;
  assert.match(patch, /^api -X PATCH repos\/o\/r( |$)/);
  for (const field of MERGE_FIELDS) assert.ok(patch.includes(field), `PATCH lacks ${field}: ${patch}`);
  assert.equal(list, 'api repos/o/r/rulesets');
  assert.match(post, /^api -X POST repos\/o\/r\/rulesets --input .*rulesets\/main\.json$/);
});

test('existing main-pr-only ruleset is updated in place with PUT', () => {
  const r = run(['o/r'], { rulesets: '[{"id":7,"name":"other"},{"id":42,"name":"main-pr-only"}]' });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(r.calls.some(c => /^api -X PUT repos\/o\/r\/rulesets\/42 --input /.test(c)), r.calls.join('\n'));
  assert.ok(!r.calls.some(c => c.includes('-X POST')), 'must not create a second ruleset');
});

test('a differently named ruleset is left alone and main-pr-only is created', () => {
  const r = run(['o/r'], { rulesets: '[{"id":7,"name":"other"}]' });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(r.calls.some(c => c.startsWith('api -X POST repos/o/r/rulesets')));
  assert.ok(!r.calls.some(c => c.includes('rulesets/7')));
});

test('--dry-run makes only the read call and names the writes it would make', () => {
  const r = run(['o/r', '--dry-run']);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(r.calls, ['api repos/o/r/rulesets']);
  assert.match(r.stdout, /PATCH repos\/o\/r/);
  assert.match(r.stdout, /POST repos\/o\/r\/rulesets/);
});

test('missing argument exits 2 with usage', () => {
  const r = run([]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /usage/i);
  assert.equal(r.calls.length, 0);
});

test('gh not on PATH exits 2', () => {
  const r = run(['o/r'], { withGh: false });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /gh/);
});

test('finds rulesets/main.json from another working directory', () => {
  const r = run(['o/r'], { cwd: tmpdir() });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(r.calls.at(-1).endsWith('rulesets/main.json'));
  assert.ok(existsSync(r.calls.at(-1).split('--input ')[1]));
});

test('main.json: contexts, no bypass, every pull_request parameter', () => {
  const j = JSON.parse(readFileSync(path.join(ROOT, 'rulesets/main.json'), 'utf8'));
  assert.equal(j.name, 'main-pr-only');
  assert.equal(j.target, 'branch');
  assert.equal(j.enforcement, 'active');
  assert.deepEqual(j.bypass_actors, []);
  assert.deepEqual(j.conditions.ref_name, { include: ['~DEFAULT_BRANCH'], exclude: [] });
  const rule = type => j.rules.find(r => r.type === type);
  assert.deepEqual(rule('pull_request').parameters, {
    required_approving_review_count: 0,
    dismiss_stale_reviews_on_push: false,
    require_code_owner_review: false,
    require_last_push_approval: false,
    required_review_thread_resolution: false,
  });
  const checks = rule('required_status_checks').parameters;
  assert.deepEqual(checks.required_status_checks.map(c => c.context), ['ci / checks', 'ci / pr-title', 'ci / skills']);
  assert.equal(checks.strict_required_status_checks_policy, true);
  for (const t of ['required_linear_history', 'non_fast_forward', 'deletion']) assert.ok(rule(t), `missing rule ${t}`);
});
