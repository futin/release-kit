import type { ReadOptions, ReleasesResponse } from './read-releases.js';
export type ReleasesReader = {
    read(): Promise<ReleasesResponse>;
};
/** `root` is a checkout path, or a function read on every call (so an env test seam keeps working) answering a path or `null` for "no repo". */
export type ReleasesReaderOptions = {
    root: string | (() => string | null);
} & ReadOptions;
/**
 * A memoised {@link readReleasesResult}: an answer is kept only when complete, and only for as long as its key holds. Concurrent calls under one key share
 * one read. Never rejects.
 */
export declare function createReleasesReader(opts: ReleasesReaderOptions): ReleasesReader;
/** The first ancestor of `from` (itself included) holding a `.git` entry — a directory in a main checkout, a file in a linked worktree — or `null`. */
export declare function findRepoRoot(from: string): string | null;
