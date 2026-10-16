import type { ReleaseType } from './conventional.js';
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
/** The releases of the checkout at `repoRoot`, from its local annotated version tags. Never rejects: no git, no repo or no tags is the empty shape. */
export declare function readReleases(repoRoot: string): Promise<ReleasesResponse>;
/** Write {@link readReleases} as JSON, for an app with no backend to serve it from. */
export declare function writeReleasesJson(repoRoot: string, outFile: string): Promise<void>;
