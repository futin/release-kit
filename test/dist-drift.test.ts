import { it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// dist/ is committed (consumers install from a git tag and run no build), so it must be exactly what src/ builds to.
const root = fileURLToPath(new URL('..', import.meta.url));

const files = (dir: string): string[] => (readdirSync(dir, { recursive: true, withFileTypes: true }) as { isFile(): boolean; parentPath: string; name: string }[])
  .filter((e) => e.isFile())
  .map((e) => join(e.parentPath, e.name).slice(dir.length + 1))
  .sort();

it('committed dist/ matches a fresh build of src/', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'release-kit-drift-'));
  try {
    execFileSync(process.execPath, ['scripts/build.mjs', tmp], { cwd: root, stdio: 'pipe' });
    const dist = join(root, 'dist');
    const fresh = files(tmp);
    const committed = files(dist);
    assert.deepEqual(committed, fresh, 'dist/ file list differs from a fresh build — run npm run build');
    for (const f of fresh) {
      if (!readFileSync(join(tmp, f)).equals(readFileSync(join(dist, f)))) assert.fail(`dist/${f} differs from a fresh build — run npm run build`);
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
