export type TitleCheck = {
    ok: boolean;
    type?: string;
    scope?: string;
    breaking: boolean;
    reason?: string;
};
/** Parse a PR title against the release-kit title rule. */
export declare function checkTitle(title: string): TitleCheck;
