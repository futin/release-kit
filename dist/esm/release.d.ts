export type PullRequest = {
    number: number;
    title: string;
    body: string | null;
    merged: boolean;
    mergeCommitSha: string | null;
};
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
export type Outcome = {
    sha: string;
    action: 'already-released' | 'release-repaired' | 'no-pr' | 'not-releasing' | 'released';
    version?: string;
};
/**
 * Release every first-parent commit from the newest baseline tag reachable from `target` (inclusive) up to `target`, oldest first. Resolves to one outcome
 * per commit; rejects with `a newer release exists: <tag>` when a later commit already carries a version tag.
 */
export declare function runRelease(o: {
    cwd: string;
    target: string;
    github: GitHubPort;
    log: Log;
}): Promise<Outcome[]>;
