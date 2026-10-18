import { existsSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { defaultGitPort } from './git.js';
import type { GitPort } from './git.js';
import { readReleasesResult } from './read-releases.js';
import type { ReadOptions, ReleasesResponse } from './read-releases.js';

export type ReleasesReader = { read(): Promise<ReleasesResponse> };

/** `root` is a checkout path, or a function read on every call (so an env test seam keeps working) answering a path or `null` for "no repo". */
export type ReleasesReaderOptions = { root: string | (() => string | null) } & ReadOptions;

// A path that does not exist (a fresh repo has no packed-refs) contributes 0; nanoseconds, so two tags cut inside one millisecond still differ.
const mtime = (p: string): Promise<string> => stat(p, { bigint: true }).then((s) => String(s.mtimeNs), () => '0');

/**
 * The memo key of the checkout at `root`: root, HEAD, and the mtimes of `packed-refs` and `refs/tags` under the common git dir, so a linked worktree keys
 * on the main checkout's tags. `null` when git cannot produce it, and such a read is never memoised.
 */
async function memoKey(port: GitPort, root: string): Promise<string | null> {
  const out = await port(['rev-parse', 'HEAD', '--git-common-dir'], { cwd: root });
  const [head, common] = (out ?? '').trim().split('\n').map((l) => l.trim());
  if (!head || !common) return null;
  // git prints the common dir relative to cwd in a main checkout (`.git`) and absolute in a linked worktree.
  const dir = resolve(root, common);
  const [packed, tags] = await Promise.all([mtime(join(dir, 'packed-refs')), mtime(join(dir, 'refs', 'tags'))]);
  return JSON.stringify([root, head, packed, tags]);
}

/**
 * A memoised {@link readReleasesResult}: an answer is kept only when complete, and only for as long as its key holds. Concurrent calls under one key share
 * one read. Never rejects.
 */
export function createReleasesReader(opts: ReleasesReaderOptions): ReleasesReader {
  const { root, ...rest } = opts;
  const own = rest.git ?? defaultGitPort(rest.timeoutMs ?? 10_000);
  // The key's rev-parse goes through the same port as the read, and a port that throws must not make the reader reject.
  const port: GitPort = (args, o) => own(args, o).catch(() => null);
  let memo: { key: string; value: ReleasesResponse } | null = null;
  let inflight: { key: string; value: Promise<ReleasesResponse> } | null = null;

  return {
    async read() {
      const dir = typeof root === 'function' ? root() : root;
      if (dir === null) return { current: null, releases: [] };
      const key = await memoKey(port, dir);
      if (key === null) return (await readReleasesResult(dir, { git: port })).value;
      if (memo?.key === key) return memo.value;
      if (inflight?.key === key) return inflight.value;
      const entry = {
        key,
        value: readReleasesResult(dir, { git: port }).then((r) => {
          if (r.complete) memo = { key, value: r.value };
          // A newer read may have replaced this one while it ran; only the current entry is dropped.
          if (inflight === entry) inflight = null;
          return r.value;
        }),
      };
      inflight = entry;
      return entry.value;
    },
  };
}

/** The first ancestor of `from` (itself included) holding a `.git` entry — a directory in a main checkout, a file in a linked worktree — or `null`. */
export function findRepoRoot(from: string): string | null {
  for (let dir = resolve(from); ; dir = dirname(dir)) {
    if (existsSync(join(dir, '.git'))) return dir;
    if (dirname(dir) === dir) return null;
  }
}
