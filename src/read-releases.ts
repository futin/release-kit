import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { parseTagMessage } from './conventional.js';
import type { ReleaseType } from './conventional.js';
import { DESCRIBE_FILTER, git, versionTags } from './git.js';

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

async function repoUrl(cwd: string): Promise<string | null> {
  try {
    const m = GITHUB.exec(await git(cwd, ['remote', 'get-url', 'origin']));
    return m ? `https://github.com/${m[1]}` : null;
  } catch {
    return null;
  }
}

async function current(cwd: string): Promise<ReleasesResponse['current']> {
  try {
    const m = LONG_DESCRIBE.exec(await git(cwd, ['describe', '--long', ...DESCRIBE_FILTER]));
    return m ? { version: m[1], ahead: Number(m[2]) } : null;
  } catch {
    return null;
  }
}

/** The releases of the checkout at `repoRoot`, from its local annotated version tags. Never rejects: no git, no repo or no tags is the empty shape. */
export async function readReleases(repoRoot: string): Promise<ReleasesResponse> {
  try {
    const [tags, base] = await Promise.all([versionTags(repoRoot), repoUrl(repoRoot)]);
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
    return { current: releases.length ? await current(repoRoot) : null, releases };
  } catch {
    return { current: null, releases: [] };
  }
}

/** Write {@link readReleases} as JSON, for an app with no backend to serve it from. */
export async function writeReleasesJson(repoRoot: string, outFile: string): Promise<void> {
  const data = await readReleases(repoRoot);
  await mkdir(dirname(outFile), { recursive: true });
  await writeFile(outFile, `${JSON.stringify(data, null, 2)}\n`);
}
