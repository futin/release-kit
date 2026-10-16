// The one place release-kit launches git: argv arrays through execFile, never a shell, so a title or tag name can never be parsed as syntax.
import { execFile } from 'node:child_process';
/** A release tag's name: a full `vX.Y.Z`. A floating `v1` and a prerelease such as `v1.2.3-rc1` are not versions. */
export const VERSION_TAG = /^v\d+\.\d+\.\d+$/;
// Without `--tags` describe sees annotated tags only, so a lightweight `v9.9.9` never becomes the base. The glob alone would admit an annotated
// `v1.2.3-rc1`; the exclude is what keeps it out. Every describe in release-kit spreads this constant.
export const DESCRIBE_FILTER = ['--match', 'v[0-9]*.[0-9]*.[0-9]*', '--exclude', 'v*[!0-9.]*'];
/** Run git in `cwd`; resolves to trimmed stdout and rejects on a non-zero exit (or a missing git or directory). */
export function git(cwd, args) {
    return new Promise((resolve, reject) => {
        // A tag read on a repo with thousands of long notes is still far below this; it only exists so a runaway output fails instead of truncating.
        execFile('git', args, { cwd, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }, (err, stdout) => (err ? reject(err) : resolve(stdout.trim())));
    });
}
/** Annotated version tags pointing at `sha`. */
export async function versionTagsAt(cwd, sha) {
    const out = await git(cwd, ['for-each-ref', '--points-at', sha, '--format=%(refname:short)%00%(objecttype)', 'refs/tags/v*']);
    return out.split('\n').flatMap((line) => {
        const [name, type] = line.split('\0');
        return type === 'tag' && VERSION_TAG.test(name) ? [name] : [];
    });
}
// NUL cannot occur in a tag message, so it ends every field, the last one included; the newline git prints after each record lands on the next record's first field.
const FIELDS = 5;
const TAG_FORMAT = '--format=%(refname:short)%00%(objecttype)%00%(creatordate:iso-strict)%00%(*objectname)%00%(contents)%00';
/**
 * Every annotated `vX.Y.Z` tag with its peeled commit, creation date and full message, newest first. `--sort=-creatordate` has one-second resolution and
 * breaks ties by ascending name, so tags cut in the same second are re-ordered here by version, newest first.
 */
export async function versionTags(cwd) {
    const out = await git(cwd, ['for-each-ref', '--sort=-creatordate', TAG_FORMAT, 'refs/tags/v*']);
    const parts = out.split('\0');
    const tags = [];
    // %(contents) has newlines of its own, so records are cut on field count, not on lines.
    for (let i = 0; i + FIELDS <= parts.length; i += FIELDS) {
        const [rawName, type, date, commit, message] = parts.slice(i, i + FIELDS);
        const name = rawName.replace(/^\n/, '');
        if (type === 'tag' && VERSION_TAG.test(name))
            tags.push({ name, commit, date, message });
    }
    return tags.sort((a, b) => Date.parse(b.date) - Date.parse(a.date) || cmpVersion(b.name, a.name));
}
const cmpVersion = (a, b) => {
    const [x, y] = [a, b].map((v) => v.slice(1).split('.').map(Number));
    return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
};
