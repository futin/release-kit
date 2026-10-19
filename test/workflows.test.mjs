import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { yamlSkip } from './yaml-gate.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const WF = name => path.join(ROOT, '.github/workflows', name);

// BaseLoader keeps every scalar a string and, unlike the default loaders, does not read the bare key `on` as boolean true.
const LOADER = 'import sys, json, yaml; print(json.dumps(yaml.load(sys.stdin, Loader=yaml.BaseLoader)))';
const yamlAvailable = spawnSync('python3', ['-c', 'import yaml'], { encoding: 'utf8' }).status === 0;
const skip = yamlSkip({ available: yamlAvailable, env: process.env });

function load(name) {
  const r = spawnSync('python3', ['-c', LOADER], { input: readFileSync(WF(name), 'utf8'), encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout);
}

function runs(job) {
  return (job.steps ?? []).map(s => s.run).filter(Boolean);
}

test('ci-node.yml declares exactly the six workflow_call inputs and their defaults', { skip }, () => {
  const inputs = load('ci-node.yml').on.workflow_call.inputs;
  assert.deepEqual(Object.keys(inputs).sort(), ['check-commands', 'install-command', 'kit-ref', 'node-version', 'skills-command', 'skills-paths']);
  assert.equal(inputs['node-version'].default, '22');
  assert.equal(inputs['install-command'].default, '');
  assert.equal(inputs['check-commands'].required, 'true');
  assert.equal(inputs['skills-command'].default, '');
  assert.equal(inputs['skills-paths'].default, '');
  assert.equal(inputs['kit-ref'].default, 'v1');
});

test('ci-node.yml has exactly the jobs checks, pr-title, skills', { skip }, () => {
  assert.deepEqual(Object.keys(load('ci-node.yml').jobs).sort(), ['checks', 'pr-title', 'skills']);
});

test('no job sets name: (it would rename the required ci / <job> context)', { skip }, () => {
  for (const file of ['ci-node.yml', 'release.yml', 'self.yml', 'bump-consumers.yml']) {
    for (const [id, job] of Object.entries(load(file).jobs)) assert.equal(job.name, undefined, `${file} job ${id} sets name`);
  }
});

test('checks and skills are never conditioned at job level', { skip }, () => {
  const { jobs } = load('ci-node.yml');
  assert.equal(jobs.checks.if, undefined, 'a skipped checks job reports success for the same head sha');
  assert.equal(jobs.skills.if, undefined, 'ci / skills must report in every app');
});

test('the PR title never reaches a shell through ${{ }} interpolation', { skip }, () => {
  for (const file of ['ci-node.yml', 'self.yml']) {
    for (const [id, job] of Object.entries(load(file).jobs)) {
      for (const run of runs(job)) assert.ok(!run.includes('github.event.pull_request.title'), `${file} job ${id} interpolates the title in run:`);
    }
  }
});

test('pr-title passes the title through env PR_TITLE and runs the kit checkout', { skip }, () => {
  const job = load('ci-node.yml').jobs['pr-title'];
  const step = job.steps.find(s => s.run && s.run.includes('pr-title.mjs'));
  assert.ok(step, 'no step runs pr-title.mjs');
  assert.match(step.env.PR_TITLE, /github\.event\.pull_request\.title/);
  assert.ok(job.steps.some(s => s.with && s.with.repository === 'futin/release-kit' && s.with.path === '.release-kit'));
});

test('top-level permissions are contents: read', { skip }, () => {
  assert.deepEqual(load('ci-node.yml').permissions, { contents: 'read' });
});

test('checks install handles pnpm, npm and no lockfile', { skip }, () => {
  const install = runs(load('ci-node.yml').jobs.checks).find(r => r.includes('lockfile'));
  assert.ok(install, 'no install step');
  assert.ok(install.includes('pnpm-lock.yaml'));
  assert.ok(install.includes('package-lock.json'));
  assert.ok(install.includes('no lockfile — install skipped'));
});

test('skills handles push before it reads a PR base sha', { skip }, () => {
  const script = runs(load('ci-node.yml').jobs.skills).join('\n');
  assert.ok(script.includes('push — skills gate is PR-only'));
  const eventCheck = script.indexOf('GITHUB_EVENT_NAME');
  assert.ok(eventCheck >= 0, 'no event-name branch');
  assert.ok(eventCheck < script.indexOf('BASE_SHA'), 'base sha read before the event-name branch');
  assert.ok(script.includes('no skills suite'));
});

test('self.yml calls ci-node.yml from a job whose id is ci', { skip }, () => {
  const { jobs } = load('self.yml');
  assert.equal(jobs.ci.uses, './.github/workflows/ci-node.yml');
  const commands = jobs.ci.with['check-commands'];
  assert.ok(commands.includes('npm run typecheck'), 'typecheck missing from check-commands');
  assert.ok(commands.indexOf('npm run typecheck') < commands.indexOf('npm test'), 'npm test must come after npm run typecheck');
});

test('every setup-node step turns off its package-manager cache (it runs before corepack puts pnpm on PATH)', { skip }, () => {
  for (const file of ['ci-node.yml', 'bump-consumers.yml']) {
    for (const [id, job] of Object.entries(load(file).jobs)) {
      for (const step of job.steps.filter(s => (s.uses ?? '').startsWith('actions/setup-node@'))) {
        assert.equal(step.with?.['package-manager-cache'], 'false', `${file} job ${id}: setup-node would look for the packageManager binary`);
      }
    }
  }
});

test('release.yml declares exactly the three workflow_call inputs and their defaults', { skip }, () => {
  const inputs = load('release.yml').on.workflow_call.inputs;
  assert.deepEqual(Object.keys(inputs).sort(), ['kit-ref', 'node-version', 'sha']);
  assert.equal(inputs.sha.default, '');
  assert.equal(inputs['kit-ref'].default, 'v1');
  assert.equal(inputs['node-version'].default, '22');
});

test('release.yml has one job, release, with contents: write and pull-requests: read (setting contents alone drops pull-requests to none)', { skip }, () => {
  const { jobs } = load('release.yml');
  assert.deepEqual(Object.keys(jobs), ['release']);
  assert.deepEqual(jobs.release.permissions, { contents: 'write', 'pull-requests': 'read' });
});

test('release checks the app out with full history and the kit into .release-kit at kit-ref', { skip }, () => {
  const steps = load('release.yml').jobs.release.steps;
  const checkouts = steps.filter(s => (s.uses ?? '').startsWith('actions/checkout@'));
  assert.equal(checkouts.length, 2);
  assert.equal(checkouts[0].with['fetch-depth'], '0', 'tags and the first-parent range need full history');
  assert.equal(checkouts[0].with.repository, undefined, 'the first checkout is the app');
  assert.equal(checkouts[1].with.repository, 'futin/release-kit');
  assert.equal(checkouts[1].with.path, '.release-kit');
  assert.match(checkouts[1].with.ref, /inputs\.kit-ref/);
});

test('release.yml turns off setup-node package-manager-cache and sets the bot tagger identity', { skip }, () => {
  const steps = load('release.yml').jobs.release.steps;
  for (const step of steps.filter(s => (s.uses ?? '').startsWith('actions/setup-node@'))) assert.equal(step.with?.['package-manager-cache'], 'false');
  const identity = runs(load('release.yml').jobs.release).join('\n');
  assert.ok(identity.includes('github-actions[bot]'));
  assert.ok(identity.includes('41898282+github-actions[bot]@users.noreply.github.com'));
});

test('no run: in release.yml interpolates ${{ }} (title, body and notes are never on a shell line)', { skip }, () => {
  for (const run of runs(load('release.yml').jobs.release)) assert.ok(!run.includes('${{'), `run: interpolates an expression:\n${run}`);
});

test('the release CLI step gets TARGET_SHA, GH_TOKEN and DEFAULT_BRANCH through env only', { skip }, () => {
  const step = load('release.yml').jobs.release.steps.find(s => s.run && s.run.includes('release-cli.js'));
  assert.ok(step, 'no step runs release-cli.js');
  assert.equal(step.run.trim(), 'node .release-kit/dist/esm/release-cli.js');
  assert.match(step.env.TARGET_SHA, /inputs\.sha \|\| github\.sha/);
  assert.match(step.env.GH_TOKEN, /github\.token/);
  assert.match(step.env.DEFAULT_BRANCH, /github\.event\.repository\.default_branch/);
});

test('self.yml calls release.yml on push with the kit ref of the branch under test', { skip }, () => {
  const job = load('self.yml').jobs.release;
  assert.ok(job, 'no release job');
  assert.equal(job.uses, './.github/workflows/release.yml');
  assert.equal(job.if, "github.event_name == 'push'");
  assert.deepEqual(job.permissions, { contents: 'write', 'pull-requests': 'read' });
  assert.match(job.with['kit-ref'], /github\.ref_name/);
});

const isKitCheckout = s => (s.uses ?? '').startsWith('actions/checkout@') && s.with?.repository === 'futin/release-kit' && s.with?.path === '.release-kit';

test('bump-consumers.yml declares exactly the five workflow_call inputs and the required secret token', { skip }, () => {
  const call = load('bump-consumers.yml').on.workflow_call;
  assert.deepEqual(Object.keys(call.inputs).sort(), ['auto-merge', 'consumers', 'kit-ref', 'package', 'repository']);
  assert.equal(call.inputs['kit-ref'].default, 'v1');
  assert.equal(call.inputs['auto-merge'].type, 'boolean');
  assert.equal(call.inputs['auto-merge'].default, 'true');
  assert.deepEqual(Object.keys(call.secrets), ['token']);
  assert.equal(call.secrets.token.required, 'true');
});

test('bump-consumers version job reads the caller with full history and the kit at kit-ref, and outputs version and versions', { skip }, () => {
  const job = load('bump-consumers.yml').jobs.version;
  assert.ok(job, 'no version job');
  const checkouts = job.steps.filter(s => (s.uses ?? '').startsWith('actions/checkout@'));
  assert.equal(checkouts[0].with?.repository, undefined, 'the first checkout is the caller');
  assert.equal(checkouts[0].with['fetch-depth'], '0', 'a depth-1 checkout has no tags, so every run would end at "no version"');
  const kit = job.steps.find(isKitCheckout);
  assert.ok(kit, 'no release-kit checkout into .release-kit');
  assert.match(kit.with.ref, /inputs\.kit-ref/);
  assert.match(job.outputs.version, /steps\.\w+\.outputs\.version/);
  assert.match(job.outputs.versions, /steps\.\w+\.outputs\.versions/);
  const script = runs(job).join('\n');
  assert.ok(script.includes('.release-kit/dist/esm/'), 'the version is not read by the kit code');
  assert.ok(script.includes('readReleases'), 'the order must be readReleases\' order');
  assert.ok(script.includes('::warning::'), 'no version must warn');
});

test('bump-consumers matrix runs per consumer only when there is a version, fail-fast off, from the kit at kit-ref', { skip }, () => {
  const job = load('bump-consumers.yml').jobs.bump;
  assert.ok(job, 'no bump job');
  assert.ok([job.needs].flat().includes('version'));
  assert.match(job.if, /needs\.version\.outputs\.version != ''/);
  assert.equal(job.strategy['fail-fast'], 'false');
  assert.match(job.strategy.matrix.consumer, /consumers/);
  const kit = job.steps.find(isKitCheckout);
  assert.ok(kit, 'no release-kit checkout into .release-kit');
  assert.match(kit.with.ref, /inputs\.kit-ref/);
  assert.ok(job.steps.some(s => (s.uses ?? '').startsWith('actions/setup-node@v5') && s.with?.['package-manager-cache'] === 'false'));
  assert.equal(job.env.COREPACK_ENABLE_DOWNLOAD_PROMPT, '0');
});

test('the bump-consumer.mjs step gets exactly PKG, REPOSITORY, CONSUMER, VERSION, VERSIONS, AUTO_MERGE and GH_TOKEN through env', { skip }, () => {
  const step = load('bump-consumers.yml').jobs.bump.steps.find(s => s.run && s.run.includes('bump-consumer.mjs'));
  assert.ok(step, 'no step runs bump-consumer.mjs');
  assert.deepEqual(Object.keys(step.env).sort(), ['AUTO_MERGE', 'CONSUMER', 'GH_TOKEN', 'PKG', 'REPOSITORY', 'VERSION', 'VERSIONS']);
  assert.match(step.env.AUTO_MERGE, /inputs\.auto-merge/);
  assert.match(step.env.PKG, /inputs\.package/);
  assert.match(step.env.REPOSITORY, /inputs\.repository/);
  assert.match(step.env.CONSUMER, /matrix\.consumer/);
  assert.match(step.env.VERSION, /needs\.version\.outputs\.version\b/);
  assert.match(step.env.VERSIONS, /needs\.version\.outputs\.versions/);
  assert.match(step.env.GH_TOKEN, /secrets\.token/);
});

test('no run: in bump-consumers.yml interpolates ${{ }} (inputs, matrix and event text reach the shell through env only)', { skip }, () => {
  for (const [id, job] of Object.entries(load('bump-consumers.yml').jobs)) {
    for (const run of runs(job)) assert.ok(!run.includes('${{'), `job ${id} run: interpolates an expression:\n${run}`);
  }
});

test('secrets.token appears only under env: of steps that run git, gh or the bump script', { skip }, () => {
  const wf = load('bump-consumers.yml');
  const hits = [];
  const walk = (node, at) => {
    if (typeof node === 'string') {
      if (node.includes('secrets.token')) hits.push(at);
    } else if (node && typeof node === 'object') {
      for (const [k, v] of Object.entries(node)) walk(v, [...at, k]);
    }
  };
  walk(wf.jobs, []);
  assert.ok(hits.length > 0, 'the token is never used');
  for (const at of hits) {
    const [jobId, steps, i, env] = at;
    assert.ok(steps === 'steps' && env === 'env' && at.length === 5, `secrets.token outside a step env: jobs.${at.join('.')}`);
    const run = wf.jobs[jobId].steps[i].run ?? '';
    assert.ok(/\b(gh|git)\s|bump-consumer\.mjs/.test(run), `jobs.${at.join('.')} is on a step that runs neither git, gh nor the script`);
  }
  const clone = runs(wf.jobs.bump).find(r => r.includes('gh repo clone'));
  assert.ok(clone, 'the consumer is not cloned with gh repo clone');
});

test('self.yml bumps the three apps and ui-kit after release, on push, from the kit ref of the branch under test', { skip }, () => {
  const job = load('self.yml').jobs.bump;
  assert.ok(job, 'no bump job');
  assert.equal(job.needs, 'release');
  assert.equal(job.if, "github.event_name == 'push'");
  assert.equal(job.uses, './.github/workflows/bump-consumers.yml');
  assert.match(job.with['kit-ref'], /^\$\{\{ github\.ref_name \}\}$/);
  assert.equal(job.with.package, 'release-kit');
  assert.equal(job.with.repository, 'futin/release-kit');
  const consumers = job.with.consumers.split('\n').map(l => l.trim()).filter(Boolean);
  assert.deepEqual(consumers, ['futin/claude-agents-dashboard', 'futin/backlog-manager', 'futin/guide-manager', 'futin/ui-kit']);
  assert.match(job.secrets.token, /^\$\{\{ secrets\.BUMP_TOKEN \}\}$/);
});
