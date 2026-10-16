// CLI: `node dist/esm/release-cli.js`, run by the reusable release workflow from a bare checkout of the kit with no install. It may import only Node built-ins
// and its sibling dist modules. Esm only and never imported by index.ts, so the cjs build leaves it out.
import { execFile } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runRelease } from './release.js';
// execFile with an argv array and never a shell: a title or tag name can hold anything. A non-zero exit resolves rather than rejects so the caller can read
// stderr, which is the only place `gh` says why it failed. GH_TOKEN reaches gh through the inherited environment.
function gh(args) {
    return new Promise((resolve, reject) => {
        execFile('gh', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }, (err, stdout, stderr) => {
            if (!err)
                return resolve({ code: 0, stdout, stderr });
            const code = err.code;
            // A string code is a spawn failure (ENOENT: no gh on PATH), not an exit status.
            if (typeof code !== 'number')
                return reject(err);
            resolve({ code, stdout, stderr });
        });
    });
}
const fail = (args, r) => new Error(`gh ${args.slice(0, 2).join(' ')} failed (exit ${r.code}): ${r.stderr.trim() || r.stdout.trim()}`);
const toPull = (p) => ({
    number: p.number,
    title: p.title,
    body: p.body ?? null,
    merged: p.merged_at != null,
    mergeCommitSha: p.merge_commit_sha ?? null,
});
/** The GitHubPort over the `gh` CLI for `repo` (`owner/name`). */
export function createGhPort(repo) {
    return {
        async pullsForCommit(sha) {
            const args = ['api', `repos/${repo}/commits/${sha}/pulls`];
            const r = await gh(args);
            if (r.code !== 0)
                throw fail(args, r);
            return JSON.parse(r.stdout).map(toPull);
        },
        async getPull(n) {
            const args = ['api', `repos/${repo}/pulls/${n}`];
            const r = await gh(args);
            // gh prints the status in its error line; only a 404 means "no such PR", anything else (auth, rate limit, outage) must not read as one.
            if (r.code !== 0 && /HTTP 404/.test(r.stderr))
                return null;
            if (r.code !== 0)
                throw fail(args, r);
            return toPull(JSON.parse(r.stdout));
        },
        async releaseExists(tag) {
            const args = ['release', 'view', tag, '--repo', repo];
            const r = await gh(args);
            if (r.code === 0)
                return true;
            if (/release not found/.test(r.stderr))
                return false;
            throw fail(args, r);
        },
        async createRelease(tag, title, notes) {
            // --notes-file, never --notes: the notes can hold backticks and `$(...)` and must not depend on any quoting.
            const dir = await mkdtemp(join(tmpdir(), 'release-kit-notes-'));
            try {
                const file = join(dir, 'notes.md');
                await writeFile(file, notes);
                const args = ['release', 'create', tag, '--verify-tag', '--repo', repo, '--title', title, '--notes-file', file];
                const r = await gh(args);
                if (r.code !== 0)
                    throw fail(args, r);
            }
            finally {
                await rm(dir, { recursive: true, force: true });
            }
        },
    };
}
// Workflow commands are line-based: an unescaped newline in a warning would start a second, attacker-shaped command.
const escapeData = (s) => s.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');
/** Info as plain lines, warnings as `::warning::` annotations. `write` defaults to stdout. */
export function createLog(write = (l) => console.log(l)) {
    return {
        info: (m) => write(m),
        warning: (m) => write(`::warning::${escapeData(m)}`),
    };
}
function isMain() {
    try {
        return realpathSync(process.argv[1] ?? '') === realpathSync(fileURLToPath(import.meta.url));
    }
    catch {
        return false;
    }
}
async function main() {
    const target = process.env.TARGET_SHA ?? '';
    const repo = process.env.GITHUB_REPOSITORY ?? '';
    if (!/^[0-9a-f]{7,40}$/.test(target))
        throw new Error(`TARGET_SHA must be 7-40 lowercase hex characters; got ${JSON.stringify(target)}`);
    if (!repo)
        throw new Error('GITHUB_REPOSITORY is not set');
    const branch = process.env.DEFAULT_BRANCH ?? '';
    if (!branch)
        throw new Error('DEFAULT_BRANCH is not set');
    // Only a manual dispatch should hear "a newer release exists"; a re-run of a superseded push run must end green.
    const onNewer = process.env.GITHUB_EVENT_NAME === 'workflow_dispatch' ? 'reject' : 'skip';
    const log = createLog();
    const outcomes = await runRelease({ cwd: process.cwd(), target, github: createGhPort(repo), log, onNewer, trunk: `origin/${branch}` });
    for (const o of outcomes)
        log.info(`${o.sha.slice(0, 7)}: ${o.action}${o.version ? ` v${o.version}` : ''}`);
}
if (isMain()) {
    main().catch((e) => {
        console.log(`::error::${escapeData(e instanceof Error ? e.message : String(e))}`);
        process.exit(1);
    });
}
