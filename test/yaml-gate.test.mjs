import test from 'node:test';
import assert from 'node:assert/strict';
import { yamlSkip } from './yaml-gate.mjs';

test('PyYAML present: never skip', () => {
  assert.equal(yamlSkip({ available: true, env: {} }), false);
  assert.equal(yamlSkip({ available: true, env: { CI: 'true' } }), false);
});

test('PyYAML missing on a dev machine: skip with a reason naming PyYAML', () => {
  assert.match(yamlSkip({ available: false, env: {} }), /PyYAML/);
});

test('PyYAML missing under CI: do not skip, so the guards fail instead of passing unrun', () => {
  assert.equal(yamlSkip({ available: false, env: { CI: 'true' } }), false);
});
