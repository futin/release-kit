import type { GitHubPort, Log } from './release.js';
/** The GitHubPort over the `gh` CLI for `repo` (`owner/name`). */
export declare function createGhPort(repo: string): GitHubPort;
/** Info as plain lines, warnings as `::warning::` annotations. `write` defaults to stdout. */
export declare function createLog(write?: (line: string) => void): Log;
