// The release engine: spec §Phase C › Release workflow, steps 1-6, run once per first-parent commit in the range. It reaches GitHub only through the
// GitHubPort it is given (the CLI wraps `gh` in one), so every ordering and idempotence rule below is testable against a fake.
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkTitle, formatTagMessage, isBreaking, nextVersion, parseTagMessage, RELEASE_TYPES, releaseNotes } from './conventional.js';
import type { ReleaseType } from './conventional.js';
import { DESCRIBE_FILTER, git, versionTags, versionTagsAt } from './git.js';

export type PullRequest = { number: number; title: string; body: string | null; merged: boolean; mergeCommitSha: string | null };

export interface GitHubPort {
  pullsForCommit(sha: string): Promise<PullRequest[]>;
  getPull(n: number): Promise<PullRequest | null>;
  releaseExists(tag: string): Promise<boolean>;
  createRelease(tag: string, title: string, notes: string): Promise<void>;
}

export interface Log {
  info(m: string): void;
  warning(m: string): void;
}

export type Outcome = { sha: string; action: 'already-released' | 'release-repaired' | 'no-pr' | 'not-releasing' | 'released'; version?: string };

// `git describe` has no machine-readable "nothing to describe"; its stderr is the only signal, and any other failure must still surface.
const NO_TAG = /No (names found|annotated tags|tags can describe)/;

async function describeBase(cwd: string, rev: string): Promise<string | null> {
  try {
    return await git(cwd, ['describe', '--abbrev=0', ...DESCRIBE_FILTER, rev]);
  } catch (e) {
    if (NO_TAG.test(String(e))) return null;
    throw e;
  }
}

// merge-base --is-ancestor answers through its exit code: 1 is "no", anything else is a real failure.
async function isAncestor(cwd: string, ancestor: string, descendant: string): Promise<boolean> {
  try {
    await git(cwd, ['merge-base', '--is-ancestor', ancestor, descendant]);
    return true;
  } catch (e) {
    if ((e as { code?: unknown }).code === 1) return false;
    throw e;
  }
}

// Versions are never assigned out of order: a tag on a strict descendant of the target means a later commit was already released. A tag on an unrelated
// branch is not a descendant, so it never trips this.
async function newerRelease(cwd: string, target: string): Promise<string | null> {
  for (const t of await versionTags(cwd)) {
    if (t.commit !== target && (await isAncestor(cwd, target, t.commit))) return t.name;
  }
  return null;
}

// The call can list several PRs; only the one merged as this very commit is its PR. The subject's `(#N)` is the fallback when the API lists none, and it holds
// to the same rule: a cherry-picked squash subject names a PR that was merged as some other commit.
async function findPull(github: GitHubPort, cwd: string, sha: string): Promise<PullRequest | null> {
  const listed = (await github.pullsForCommit(sha)).find((p) => p.merged && p.mergeCommitSha === sha);
  if (listed) return listed;
  const n = /\(#(\d+)\)$/.exec(await git(cwd, ['log', '-1', '--format=%s', sha]));
  const pull = n ? await github.getPull(Number(n[1])) : null;
  return pull?.merged && pull.mergeCommitSha === sha ? pull : null;
}

// `-F <file>`, never `-m`: a title or note can hold anything, and --cleanup=verbatim keeps the `#` lines the default cleanup would strip.
async function pushTag(cwd: string, tag: string, sha: string, message: string): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), 'release-kit-tag-'));
  try {
    const file = join(dir, 'message');
    await writeFile(file, message);
    await git(cwd, ['tag', '-a', tag, sha, '-F', file, '--cleanup=verbatim']);
    await git(cwd, ['push', 'origin', `refs/tags/${tag}`]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function createRelease(cwd: string, github: GitHubPort, tag: string): Promise<void> {
  if (await github.releaseExists(tag)) return;
  const { subject, notes } = parseTagMessage(await git(cwd, ['for-each-ref', '--format=%(contents)', `refs/tags/${tag}`]));
  await github.createRelease(tag, subject, notes);
}

async function releaseCommit(cwd: string, github: GitHubPort, log: Log, sha: string): Promise<Outcome> {
  // Step 1: a tag with its Release is done; a tag without one (step 6 failed earlier) only needs step 6.
  const [existing] = await versionTagsAt(cwd, sha);
  if (existing) {
    if (await github.releaseExists(existing)) return { sha, action: 'already-released' };
    await createRelease(cwd, github, existing);
    return { sha, action: 'release-repaired', version: existing.slice(1) };
  }

  // Step 2: a direct push past the ruleset must not block the commits after it, so this skips the commit and the run goes on.
  const pull = await findPull(github, cwd, sha);
  if (!pull) {
    log.warning(`no PR for ${sha}`);
    return { sha, action: 'no-pr' };
  }

  // Step 3: a body's BREAKING CHANGE line on a silent type never reaches isBreaking.
  const check = checkTitle(pull.title);
  if (!check.ok || !check.type || !RELEASE_TYPES.includes(check.type)) {
    log.info(`${sha}: "${pull.title}" does not cut a release`);
    return { sha, action: 'not-releasing' };
  }
  const type = check.type as ReleaseType;
  const breaking = isBreaking(check, pull.body);

  // Step 4: described at this commit, so a tag made earlier in this same run is the base.
  const base = await describeBase(cwd, sha);
  if (!base) throw new Error(`no baseline tag reachable from ${sha}`);
  const tag = `v${nextVersion(base, type, breaking)}`;

  // Steps 5 and 6: the tag reaches the remote before the Release, because `gh release create --verify-tag` refuses a tag it cannot find there.
  const message = formatTagMessage({ title: pull.title, pr: pull.number, notes: releaseNotes(pull.body), type, scope: check.scope, breaking });
  await pushTag(cwd, tag, sha, message);
  await createRelease(cwd, github, tag);
  return { sha, action: 'released', version: tag.slice(1) };
}

/**
 * Release every first-parent commit from the newest baseline tag reachable from `target` (inclusive) up to `target`, oldest first. Resolves to one outcome
 * per commit. When a later commit already carries a version tag, `onNewer` decides: 'reject' fails with `a newer release exists: <tag>` (a manual dispatch,
 * where the operator should hear it), 'skip' resolves to `[]` after an info line (a re-run of a superseded push run, which must end green). Either way
 * nothing is tagged, because a re-run could otherwise tag a commit that was skipped as no-pr out of order. A `target` that is not on `trunk` (a ref
 * resolvable in `cwd`, such as `origin/main`) rejects first, in both modes: a dispatch could otherwise tag a commit that never reached the default branch.
 */
export async function runRelease(o: { cwd: string; target: string; github: GitHubPort; log: Log; onNewer: 'reject' | 'skip'; trunk: string }): Promise<Outcome[]> {
  const { cwd, github, log } = o;
  const target = await git(cwd, ['rev-parse', `${o.target}^{commit}`]);
  if (!(await isAncestor(cwd, target, o.trunk))) throw new Error(`target ${target} is not on ${o.trunk}`);
  const newer = await newerRelease(cwd, target);
  if (newer) {
    if (o.onNewer === 'reject') throw new Error(`a newer release exists: ${newer}`);
    log.info(`a newer release exists: ${newer} — nothing to do`);
    return [];
  }

  const base = await describeBase(cwd, target);
  if (!base) {
    log.warning('no baseline tag — see Baseline');
    return [];
  }
  // `<base>..<target>` excludes the base commit itself, which step 1 still has to see so a baseline whose Release is missing gets repaired.
  const baseCommit = await git(cwd, ['rev-parse', `${base}^{commit}`]);
  const range = await git(cwd, ['rev-list', '--first-parent', '--reverse', `${base}..${target}`]);
  const commits = [baseCommit, ...(range ? range.split('\n') : [])];

  const outcomes: Outcome[] = [];
  for (const sha of commits) outcomes.push(await releaseCommit(cwd, github, log, sha));
  return outcomes;
}
