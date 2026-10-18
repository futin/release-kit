import { it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// The Nest apps compile with TypeScript 5.9.3 under moduleResolution: node, which release-kit's own TypeScript 7 rejects (TS5108), so this runs the
// typescript-5 alias against a consumer that has release-kit linked into its node_modules — never the root tsc.
const root = fileURLToPath(new URL('..', import.meta.url));
const tsc = join(root, 'node_modules', 'typescript-5', 'bin', 'tsc');
const fixture = join(root, 'test', 'fixtures', 'node10');

// The shim's ambient `declare module 'release-kit'` wins over node_modules, so each case is its own program: with the shim in it, the bare import would
// never reach the package's own `types`.
const typecheck = (files: string[]): { status: number | null; output: string } => {
  const tmp = mkdtempSync(join(tmpdir(), 'release-kit-node10-'));
  try {
    cpSync(fixture, tmp, { recursive: true });
    mkdirSync(join(tmp, 'node_modules'));
    symlinkSync(root, join(tmp, 'node_modules', 'release-kit'), 'dir');
    writeFileSync(join(tmp, 'tsconfig.case.json'), JSON.stringify({ extends: './tsconfig.json', files }));
    const r = spawnSync(process.execPath, [tsc, '--noEmit', '-p', join(tmp, 'tsconfig.case.json')], { encoding: 'utf8' });
    return { status: r.status, output: `${r.stdout}${r.stderr}` };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
};

it('a bare release-kit import typechecks under moduleResolution: node', () => {
  const r = typecheck(['consumer.ts']);
  assert.equal(r.status, 0, r.output);
});

it("guide-manager's declare module shim still resolves its deep import and exports readReleases", () => {
  const r = typecheck(['consumer.ts', 'shim.ts']);
  assert.equal(r.status, 0, r.output);
});
