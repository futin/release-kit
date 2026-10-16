/** A release tag's name: a full `vX.Y.Z`. A floating `v1` and a prerelease such as `v1.2.3-rc1` are not versions. */
export declare const VERSION_TAG: RegExp;
export declare const DESCRIBE_FILTER: string[];
/** Run git in `cwd`; resolves to trimmed stdout and rejects on a non-zero exit (or a missing git or directory). */
export declare function git(cwd: string, args: string[]): Promise<string>;
/** Annotated version tags pointing at `sha`. */
export declare function versionTagsAt(cwd: string, sha: string): Promise<string[]>;
export type VersionTag = {
    name: string;
    commit: string;
    date: string;
    message: string;
};
/**
 * Every annotated `vX.Y.Z` tag with its peeled commit, creation date and full message, newest first. `--sort=-creatordate` has one-second resolution and
 * breaks ties by ascending name, so tags cut in the same second are re-ordered here by version, newest first.
 */
export declare function versionTags(cwd: string): Promise<VersionTag[]>;
