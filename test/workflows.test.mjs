import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const WF = name => path.join(ROOT, '.github/workflows', name);

// BaseLoader keeps every scalar a string and, unlike the default loaders, does not read the bare key `on` as boolean true.
const LOADER = 'import sys, json, yaml; print(json.dumps(yaml.load(sys.stdin, Loader=yaml.BaseLoader)))';
const yamlAvailable = spawnSync('python3', ['-c', 'import yaml'], { encoding: 'utf8' }).status === 0;
const skip = yamlAvailable ? false : 'python3 with PyYAML is not available';

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
  for (const file of ['ci-node.yml', 'self.yml']) {
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
  assert.match(jobs.ci.with['check-commands'], /node --test 'test\/\*\*\/\*\.test\.mjs'/);
});
