export type TitleCheck = {
    ok: boolean;
    type?: string;
    scope?: string;
    breaking: boolean;
    reason?: string;
};
/** Parse a PR title against the release-kit title rule. */
export declare function checkTitle(title: string): TitleCheck;
export type ReleaseType = 'feat' | 'fix' | 'perf';
export declare const RELEASE_TYPES: readonly string[];
/** True for a `!` title or a body line starting `BREAKING CHANGE: `. */
export declare function isBreaking(check: TitleCheck, body: string | null): boolean;
/** Parse `1.2.3` or `v1.2.3`; anything else (a prerelease suffix, a short version) is null. */
export declare function parseVersion(v: string): [number, number, number] | null;
/** The version after `base`, without a leading `v`. Below 1.0.0 a breaking change bumps the minor, not the major. */
export declare function nextVersion(base: string, type: ReleaseType, breaking: boolean): string;
/**
 * The content of a PR body's `## What's new` section, without its heading. Comments are stripped first: the template's optional sections are commented-out
 * blocks that themselves contain `## ` headings, and a commented section must count as absent. Deeper headings (`###`) stay inside the notes.
 */
export declare function extractWhatsNew(body: string | null): string;
export type TagFields = {
    title: string;
    pr: number;
    notes: string;
    type: ReleaseType;
    scope?: string;
    breaking: boolean;
};
export type ParsedTag = {
    subject: string;
    title: string;
    type: ReleaseType | 'baseline';
    scope?: string;
    pr?: number;
    breaking: boolean;
    notes: string;
};
/** The annotated-tag message the release workflow writes and the reader parses (spec §Tag message — the contract). */
export declare function formatTagMessage(r: TagFields): string;
/** Inverse of {@link formatTagMessage}. A message without a `Release-Type` trailer block (the baseline tag) parses as type `baseline`. */
export declare function parseTagMessage(msg: string): ParsedTag;
