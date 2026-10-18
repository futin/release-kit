"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createReleasesReader = createReleasesReader;
exports.findRepoRoot = findRepoRoot;
const node_fs_1 = require("node:fs");
const promises_1 = require("node:fs/promises");
const node_path_1 = require("node:path");
const git_js_1 = require("./git.js");
const read_releases_js_1 = require("./read-releases.js");
// A path that does not exist (a fresh repo has no packed-refs) contributes 0; nanoseconds, so two tags cut inside one millisecond still differ.
const mtime = (p) => (0, promises_1.stat)(p, { bigint: true }).then((s) => String(s.mtimeNs), () => '0');
/**
 * The memo key of the checkout at `root`: root, HEAD, and the mtimes of `packed-refs` and `refs/tags` under the common git dir, so a linked worktree keys
 * on the main checkout's tags. `null` when git cannot produce it, and such a read is never memoised.
 */
async function memoKey(port, root) {
    const out = await port(['rev-parse', 'HEAD', '--git-common-dir'], { cwd: root });
    const [head, common] = (out ?? '').trim().split('\n').map((l) => l.trim());
    if (!head || !common)
        return null;
    // git prints the common dir relative to cwd in a main checkout (`.git`) and absolute in a linked worktree.
    const dir = (0, node_path_1.resolve)(root, common);
    const [packed, tags] = await Promise.all([mtime((0, node_path_1.join)(dir, 'packed-refs')), mtime((0, node_path_1.join)(dir, 'refs', 'tags'))]);
    return JSON.stringify([root, head, packed, tags]);
}
/**
 * A memoised {@link readReleasesResult}: an answer is kept only when complete, and only for as long as its key holds. Concurrent calls under one key share
 * one read. Never rejects.
 */
function createReleasesReader(opts) {
    const { root, ...rest } = opts;
    const own = rest.git ?? (0, git_js_1.defaultGitPort)(rest.timeoutMs ?? 10_000);
    // The key's rev-parse goes through the same port as the read, and a port that throws must not make the reader reject.
    const port = (args, o) => own(args, o).catch(() => null);
    let memo = null;
    let inflight = null;
    return {
        async read() {
            const dir = typeof root === 'function' ? root() : root;
            if (dir === null)
                return { current: null, releases: [] };
            const key = await memoKey(port, dir);
            if (key === null)
                return (await (0, read_releases_js_1.readReleasesResult)(dir, { git: port })).value;
            if (memo?.key === key)
                return memo.value;
            if (inflight?.key === key)
                return inflight.value;
            const entry = {
                key,
                value: (0, read_releases_js_1.readReleasesResult)(dir, { git: port }).then((r) => {
                    if (r.complete)
                        memo = { key, value: r.value };
                    // A newer read may have replaced this one while it ran; only the current entry is dropped.
                    if (inflight === entry)
                        inflight = null;
                    return r.value;
                }),
            };
            inflight = entry;
            return entry.value;
        },
    };
}
/** The first ancestor of `from` (itself included) holding a `.git` entry — a directory in a main checkout, a file in a linked worktree — or `null`. */
function findRepoRoot(from) {
    for (let dir = (0, node_path_1.resolve)(from);; dir = (0, node_path_1.dirname)(dir)) {
        if ((0, node_fs_1.existsSync)((0, node_path_1.join)(dir, '.git')))
            return dir;
        if ((0, node_path_1.dirname)(dir) === dir)
            return null;
    }
}
