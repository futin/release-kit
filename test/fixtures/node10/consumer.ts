// A Nest app's bare import, compiled with moduleResolution: node — node10 ignores `exports`, so this resolves only through top-level `types`.
import { readReleases, createReleasesReader } from 'release-kit';

export const read: typeof readReleases = readReleases;
export const reader = createReleasesReader;
