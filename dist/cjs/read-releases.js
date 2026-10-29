"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.readReleasesResult = readReleasesResult;
exports.readReleases = readReleases;
exports.writeReleasesJson = writeReleasesJson;
const promises_1 = require("node:fs/promises");
const node_path_1 = require("node:path");
const conventional_js_1 = require("./conventional.js");
const git_js_1 = require("./git.js");
// `git@github.com:owner/repo(.git)`, `https://github.com/owner/repo(.git)(/)` and `ssh://git@github.com/owner/repo(.git)`; anything else has no PR page.
const GITHUB = /^(?:git@github\.com:|(?:https?|ssh|git):\/\/(?:[^@/]+@)?github\.com\/)([\w.-]+\/[\w.-]+?)(?:\.git)?\/?$/;
const LONG_DESCRIBE = /^v(\d+\.\d+\.\d+)-(\d+)-g[0-9a-f]+$/;
const EMPTY = () => ({ current: null, releases: [] });
// A port may hand back stdout untrimmed, and both patterns anchor on `$`, so each answer is trimmed here.
async function repoUrl(port, cwd) {
    const out = await port(['remote', 'get-url', 'origin'], { cwd });
    const m = out === null ? null : GITHUB.exec(out.trim());
    return m ? `https://github.com/${m[1]}` : null;
}
async function current(port, cwd) {
    const out = await port(['describe', '--long', ...git_js_1.DESCRIBE_FILTER], { cwd });
    const m = out === null ? null : LONG_DESCRIBE.exec(out.trim());
    return m ? { version: m[1], ahead: Number(m[2]) } : null;
}
/**
 * The releases of the checkout at `repoRoot`, from its local annotated version tags, and whether that answer is complete. Never rejects. Incomplete: the tag
 * read failed (empty shape), or releases exist but describe failed or found no reachable tag (`current: null`). No version tags, or no GitHub origin to
 * build a `url` from, is still complete — a memoiser may keep those answers and should drop incomplete ones.
 */
async function readReleasesResult(repoRoot, opts = {}) {
    const own = opts.git ?? (0, git_js_1.defaultGitPort)(opts.timeoutMs ?? 10_000);
    // A caller's port is meant to answer null, but one that throws must not make the reader reject.
    const port = (args, o) => own(args, o).catch(() => null);
    try {
        const [tags, base] = await Promise.all([(0, git_js_1.versionTagsVia)(port, repoRoot), repoUrl(port, repoRoot)]);
        if (tags === null)
            return { value: EMPTY(), complete: false };
        if (!tags.length)
            return { value: EMPTY(), complete: true };
        const releases = tags.map((t) => {
            const p = (0, conventional_js_1.parseTagMessage)(t.message);
            const items = p.items.map((i) => (base ? { ...i, url: `${base}/pull/${i.pr}` } : { ...i }));
            const r = { version: t.name.slice(1), date: t.date, title: p.title, type: p.type, breaking: p.breaking, notes: p.notes, items };
            if (p.scope)
                r.scope = p.scope;
            if (p.pr !== undefined) {
                r.pr = p.pr;
                if (base)
                    r.url = `${base}/pull/${p.pr}`;
            }
            return r;
        });
        const now = await current(port, repoRoot);
        return { value: { current: now, releases }, complete: now !== null };
    }
    catch {
        return { value: EMPTY(), complete: false };
    }
}
/** {@link readReleasesResult}'s answer alone. Never rejects: no git, no repo or no tags is the empty shape. */
async function readReleases(repoRoot, opts) {
    return (await readReleasesResult(repoRoot, opts)).value;
}
/** Write {@link readReleases} as JSON, for an app with no backend to serve it from. */
async function writeReleasesJson(repoRoot, outFile) {
    const data = await readReleases(repoRoot);
    await (0, promises_1.mkdir)((0, node_path_1.dirname)(outFile), { recursive: true });
    await (0, promises_1.writeFile)(outFile, `${JSON.stringify(data, null, 2)}\n`);
}
