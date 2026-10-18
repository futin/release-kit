/** A release tag's name: a full `vX.Y.Z`. A floating `v1` and a prerelease such as `v1.2.3-rc1` are not versions. */
export declare const VERSION_TAG: RegExp;
export declare const DESCRIBE_FILTER: string[];
/**
 * Run git in `cwd`; resolves to trimmed stdout and rejects on a non-zero exit (or a missing git or directory). `timeoutMs` kills the child once it runs
 * that long (the default 0 never does); the release engine passes neither option, so its calls stay unbounded and throwing.
 */
export declare function git(cwd: string, args: string[], o?: {
    timeoutMs?: number;
    maxBuffer?: number;
}): Promise<string>;
/** How the releases reader runs git: stdout (trimmed or not, the reader copes with both), or `null` for every failure. Never rejects. */
export type GitPort = (args: string[], o: {
    cwd: string;
    maxBuffer?: number;
}) => Promise<string | null>;
/** {@link git} killed after `timeoutMs`, with the caller's `maxBuffer` when it names one, and any failure mapped to `null`. */
export declare function defaultGitPort(timeoutMs?: number): GitPort;
/** Annotated version tags pointing at `sha`. */
export declare function versionTagsAt(cwd: string, sha: string): Promise<string[]>;
export type VersionTag = {
    name: string;
    commit: string;
    date: string;
    message: string;
};
export declare const TAG_FORMAT = "--format=%(refname:short)%00%(objecttype)%00%(creatordate:iso-strict)%00%(*objectname)%00%(contents)%00";
/**
 * Every annotated `vX.Y.Z` tag with its peeled commit, creation date and full message, newest first. `--sort=-creatordate` has one-second resolution and
 * breaks ties by ascending name, so tags cut in the same second are re-ordered here by version, newest first.
 */
export declare function versionTags(cwd: string): Promise<VersionTag[]>;
/** {@link versionTags} through a port, for the releases reader: `null` when the read failed, which is not the same answer as "no tags". */
export declare function versionTagsVia(port: GitPort, cwd: string): Promise<VersionTag[] | null>;
