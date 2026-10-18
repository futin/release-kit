import type { ReleaseType } from './conventional.js';
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
export type ReleasesResponse = {
    current: {
        version: string;
        ahead: number;
    } | null;
    releases: Release[];
};
/** `timeoutMs` bounds every git read of the default port (10 000 ms); a caller's own `git` port carries its own bound and the timeout is not applied to it. */
export type ReadOptions = {
    timeoutMs?: number;
    git?: GitPort;
};
export type ReleasesResult = {
    value: ReleasesResponse;
    complete: boolean;
};
/**
 * The releases of the checkout at `repoRoot`, from its local annotated version tags, and whether that answer is complete. Never rejects. Incomplete: the tag
 * read failed (empty shape), or releases exist but describe failed or found no reachable tag (`current: null`). No version tags, or no GitHub origin to
 * build a `url` from, is still complete — a memoiser may keep those answers and should drop incomplete ones.
 */
export declare function readReleasesResult(repoRoot: string, opts?: ReadOptions): Promise<ReleasesResult>;
/** {@link readReleasesResult}'s answer alone. Never rejects: no git, no repo or no tags is the empty shape. */
export declare function readReleases(repoRoot: string, opts?: ReadOptions): Promise<ReleasesResponse>;
/** Write {@link readReleases} as JSON, for an app with no backend to serve it from. */
export declare function writeReleasesJson(repoRoot: string, outFile: string): Promise<void>;
