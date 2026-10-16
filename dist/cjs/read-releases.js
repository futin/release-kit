"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.readReleases = readReleases;
exports.writeReleasesJson = writeReleasesJson;
const promises_1 = require("node:fs/promises");
const node_path_1 = require("node:path");
const conventional_js_1 = require("./conventional.js");
const git_js_1 = require("./git.js");
// `git@github.com:owner/repo(.git)`, `https://github.com/owner/repo(.git)(/)` and `ssh://git@github.com/owner/repo(.git)`; anything else has no PR page.
const GITHUB = /^(?:git@github\.com:|(?:https?|ssh|git):\/\/(?:[^@/]+@)?github\.com\/)([\w.-]+\/[\w.-]+?)(?:\.git)?\/?$/;
const LONG_DESCRIBE = /^v(\d+\.\d+\.\d+)-(\d+)-g[0-9a-f]+$/;
async function repoUrl(cwd) {
    try {
        const m = GITHUB.exec(await (0, git_js_1.git)(cwd, ['remote', 'get-url', 'origin']));
        return m ? `https://github.com/${m[1]}` : null;
    }
    catch {
        return null;
    }
}
async function current(cwd) {
    try {
        const m = LONG_DESCRIBE.exec(await (0, git_js_1.git)(cwd, ['describe', '--long', ...git_js_1.DESCRIBE_FILTER]));
        return m ? { version: m[1], ahead: Number(m[2]) } : null;
    }
    catch {
        return null;
    }
}
/** The releases of the checkout at `repoRoot`, from its local annotated version tags. Never rejects: no git, no repo or no tags is the empty shape. */
async function readReleases(repoRoot) {
    try {
        const [tags, base] = await Promise.all([(0, git_js_1.versionTags)(repoRoot), repoUrl(repoRoot)]);
        const releases = tags.map((t) => {
            const p = (0, conventional_js_1.parseTagMessage)(t.message);
            const r = { version: t.name.slice(1), date: t.date, title: p.title, type: p.type, breaking: p.breaking, notes: p.notes };
            if (p.scope)
                r.scope = p.scope;
            if (p.pr !== undefined) {
                r.pr = p.pr;
                if (base)
                    r.url = `${base}/pull/${p.pr}`;
            }
            return r;
        });
        return { current: releases.length ? await current(repoRoot) : null, releases };
    }
    catch {
        return { current: null, releases: [] };
    }
}
/** Write {@link readReleases} as JSON, for an app with no backend to serve it from. */
async function writeReleasesJson(repoRoot, outFile) {
    const data = await readReleases(repoRoot);
    await (0, promises_1.mkdir)((0, node_path_1.dirname)(outFile), { recursive: true });
    await (0, promises_1.writeFile)(outFile, `${JSON.stringify(data, null, 2)}\n`);
}
