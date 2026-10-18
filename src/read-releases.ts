import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { parseTagMessage } from './conventional.js';
import type { ReleaseType } from './conventional.js';
import { DESCRIBE_FILTER, defaultGitPort, versionTagsVia } from './git.js';
import type { GitPort } from './git.js';

export type Release = {
  version: string;
  date: string;
  title: string;
  type: ReleaseType | 'baseline';
  scope?: string;
  pr?: number;
  breaking: boolean;
  notes: string;
  url?: string;
};

export type ReleasesResponse = { current: { version: string; ahead: number } | null; releases: Release[] };

// `git@github.com:owner/repo(.git)`, `https://github.com/owner/repo(.git)(/)` and `ssh://git@github.com/owner/repo(.git)`; anything else has no PR page.
const GITHUB = /^(?:git@github\.com:|(?:https?|ssh|git):\/\/(?:[^@/]+@)?github\.com\/)([\w.-]+\/[\w.-]+?)(?:\.git)?\/?$/;

const LONG_DESCRIBE = /^v(\d+\.\d+\.\d+)-(\d+)-g[0-9a-f]+$/;

/** `timeoutMs` bounds every git read of the default port (10 000 ms); a caller's own `git` port carries its own bound and the timeout is not applied to it. */
export type ReadOptions = { timeoutMs?: number; git?: GitPort };

export type ReleasesResult = { value: ReleasesResponse; complete: boolean };

const EMPTY = (): ReleasesResponse => ({ current: null, releases: [] });

// A port may hand back stdout untrimmed, and both patterns anchor on `$`, so each answer is trimmed here.
async function repoUrl(port: GitPort, cwd: string): Promise<string | null> {
  const out = await port(['remote', 'get-url', 'origin'], { cwd });
  const m = out === null ? null : GITHUB.exec(out.trim());
  return m ? `https://github.com/${m[1]}` : null;
}

async function current(port: GitPort, cwd: string): Promise<ReleasesResponse['current']> {
  const out = await port(['describe', '--long', ...DESCRIBE_FILTER], { cwd });
  const m = out === null ? null : LONG_DESCRIBE.exec(out.trim());
  return m ? { version: m[1], ahead: Number(m[2]) } : null;
}

/**
 * The releases of the checkout at `repoRoot`, from its local annotated version tags, and whether that answer is complete. Never rejects. Incomplete: the tag
 * read failed (empty shape), or releases exist but describe failed or found no reachable tag (`current: null`). No version tags, or no GitHub origin to
 * build a `url` from, is still complete — a memoiser may keep those answers and should drop incomplete ones.
 */
export async function readReleasesResult(repoRoot: string, opts: ReadOptions = {}): Promise<ReleasesResult> {
  const own = opts.git ?? defaultGitPort(opts.timeoutMs ?? 10_000);
  // A caller's port is meant to answer null, but one that throws must not make the reader reject.
  const port: GitPort = (args, o) => own(args, o).catch(() => null);
  try {
    const [tags, base] = await Promise.all([versionTagsVia(port, repoRoot), repoUrl(port, repoRoot)]);
    if (tags === null) return { value: EMPTY(), complete: false };
    if (!tags.length) return { value: EMPTY(), complete: true };
    const releases = tags.map((t): Release => {
      const p = parseTagMessage(t.message);
      const r: Release = { version: t.name.slice(1), date: t.date, title: p.title, type: p.type, breaking: p.breaking, notes: p.notes };
      if (p.scope) r.scope = p.scope;
      if (p.pr !== undefined) {
        r.pr = p.pr;
        if (base) r.url = `${base}/pull/${p.pr}`;
      }
      return r;
    });
    const now = await current(port, repoRoot);
    return { value: { current: now, releases }, complete: now !== null };
  } catch {
    return { value: EMPTY(), complete: false };
  }
}

/** {@link readReleasesResult}'s answer alone. Never rejects: no git, no repo or no tags is the empty shape. */
export async function readReleases(repoRoot: string, opts?: ReadOptions): Promise<ReleasesResponse> {
  return (await readReleasesResult(repoRoot, opts)).value;
}

/** Write {@link readReleases} as JSON, for an app with no backend to serve it from. */
export async function writeReleasesJson(repoRoot: string, outFile: string): Promise<void> {
  const data = await readReleases(repoRoot);
  await mkdir(dirname(outFile), { recursive: true });
  await writeFile(outFile, `${JSON.stringify(data, null, 2)}\n`);
}
