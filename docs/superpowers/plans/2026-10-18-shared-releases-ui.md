# Shared Releases UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **House override of the writing-plans template:** this plan gives **behaviour, signatures, exact values and exact test cases — never literal
> code**. Where the template asks for code blocks, write the test from the case list and the body from the signature; disagree with the plan when the code
> says otherwise, and say so in the task report. Size targets anywhere here are soft.

**Goal:** One implementation of the release chip, What's new drawer and `/api/releases` read, imported by claude-agents-dashboard, backlog-manager and
guide-manager, plus a bump-PR workflow that keeps every consumer on the newest release of each shared package.

**Architecture:** release-kit gains a bounded reader with an injectable git port and a memoised reader factory (server). A new repo `ui-kit` ships the
React side (Drawer shell, chip, panel, hooks, pure logic) themed through `--uk-*` tokens. A reusable `bump-consumers.yml` in release-kit opens a
`chore(deps)` PR in each consumer on every release. Each app then migrates in its own PR.

**Tech Stack:** TypeScript (release-kit: tsc 7, `node:test` + tsx, npm), React 18 peer, GitHub Actions, Python PyYAML for workflow guard tests. Apps:
NestJS + Jest (guide-manager, backlog-manager), raw Node `http` + tsx test runner + Playwright (dashboard), pnpm 12 in all three.

**Spec:** `docs/superpowers/specs/2026-10-18-shared-releases-ui-design.md` (decisions D1–D19, Parts 0–3). Read it before any task; task text cites it
as `spec Dn` / `spec Part n`.

## Global Constraints

- Every change lands through a PR whose Conventional Commits title decides the release; squash merges only. **No push, PR, repo creation, secret or tag
  without the user's explicit yes** — the gates below are user steps.
- Prose (comments, docs) wraps at 160 columns unless the repo's own config says otherwise; commit bodies at 72.
- release-kit and ui-kit commit `dist/`; a dist-drift test fails when it is stale; `npm run build` regenerates it. Nothing may need building at install.
- release-kit's root export stays React-free; ui-kit has no runtime dependency on release-kit (devDependency only, spec D19).
- Default read timeout `10_000` ms; `for-each-ref` `maxBuffer` `32 * 1024 * 1024`; default port honours `o.maxBuffer`.
- Bump PR title exactly `chore(deps): bump <package> to vX.Y.Z`; branch exactly `bump/<package>-vX.Y.Z`; secret name `BUMP_TOKEN`.
- ui-kit classes `uk-*`, custom properties `--uk-*` each with a fallback; shipped CSS has no media queries; components never import CSS.
- `react` peer range `^18.3 || ^19`; no `react-dom` peer.
- localStorage keys stay: `dashboard.releases.lastSeen`, `backlog-manager.releases-last-seen`, `guide-manager.releases-last-seen`.
- No `${{ }}` inside any `run:` carries `inputs.*`, PR or event text — env or argv only.
- In release-kit and ui-kit, every task that touches `src/` runs `npm run build` before `npm test` and commits `dist/` with its change — the
  dist-drift test fails otherwise. "Run `npm test` — pass" below always means after that build.

## Review Focus

Inputs the spec implies that the per-feature cases below could miss; each has its test placed in the named task.

1. **A tag message with CRLF line endings or a trailing blank line** — the reader must parse it as `parseTagMessage` does today (the port may or may not
   trim). Test in Task B1: "untrimmed and trimmed port output, CRLF message → deep-equal answers".
2. **Two releases cut in the same second** (`0.9.0`, `0.10.0`) — newest-first order by version, not by refname, survives the port path. Task B1.
3. **A stored last-seen value from the dashboard's older build that is *higher* than every release** (a viewer who last opened a newer checkout) —
   opening the drawer must not write the lower newest back. Task D4 (`useWhatsNew`): "stored `0.9.0`, newest `0.5.0`, open → storage still `0.9.0`".
4. **Release notes containing an `&` inside a link URL and a `)` inside link text** — link stays one anchor with an escaped href, nothing leaks out of the
   attribute. Task D3.
5. **The drawer opened while the first `/api/releases` read has not answered** — no chip, so the drawer cannot open; once data arrives, `show()` opens it
   with that data and a refetch failure keeps it. Task D4: "show() then refetch rejects → drawer stays open with the previous data".

---

## Phase A — claude-agents-dashboard prerequisite (spec Part 0)

One PR, title `test(deps): accept any exact release-kit tag`. Must merge before Phase B merges.

### Task A1: Loosen the release-kit pin check

**Files:** Modify `claude-agents-dashboard/test/server-deps.test.ts` (the `PINNED` table and its assertion).

**Interfaces:** none.

- [ ] **Step 1: Write the failing cases** — the check becomes "the `release-kit` spec matches `^github:futin/release-kit#v\d+\.\d+\.\d+$`"; extract it
  as an exported predicate `isExactKitPin(spec: string): boolean` and test it: `github:futin/release-kit#v1.1.0` → true; `#v1.2.0` → true; `#v1` → false;
  `#main` → false; `github:futin/release-kit` (no ref) → false; `#v1.2.0-rc1` → false. `lookout-widgets` keeps its literal pin.
- [ ] **Step 2: Run** `pnpm test` — the new cases fail (predicate missing).
- [ ] **Step 3: Implement** the predicate and use it for `release-kit` only; update the file's header comment (still "no floating ref", now "any exact
  tag").
- [ ] **Step 4: Run** `pnpm test` — pass. **Step 5: Commit** `test(deps): accept any exact release-kit tag`.

---

## Phase B — release-kit (spec Part 1)

One PR from a branch off `main`, title `feat(releases): bounded reader, memoised reader and bump-consumers workflow` (cuts `v1.2.0`).

**Gate before merge (user):** create the fine-grained PAT (spec D12: Contents, Pull requests, Issues — read/write — on the three app repos) and add it
as `BUMP_TOKEN` in release-kit; Phase A merged. **Gate after merge (user):** once green, move `v1` to `v1.2.0` (README §Moving `v1`).

### Task B1: Git port and `readReleasesResult`

**Files:** Modify `src/git.ts`, `src/read-releases.ts`, `src/index.ts`; Test `test/read-releases.test.ts` (extend), new `test/fixtures/fake-git.sh`.

**Interfaces — Produces:**
- `type GitPort = (args: string[], o: { cwd: string; maxBuffer?: number }) => Promise<string | null>`
- `type ReadOptions = { timeoutMs?: number; git?: GitPort }`
- `readReleasesResult(root: string, opts?: ReadOptions): Promise<{ value: ReleasesResponse; complete: boolean }>`
- `readReleases(root: string, opts?: ReadOptions): Promise<ReleasesResponse>` (= `.value`)
- `defaultGitPort(timeoutMs?: number): GitPort` — exported from `src/index.ts` too, because the dashboard's server may import only the bare
  `release-kit` specifier (`claude-agents-dashboard/test/server-deps.test.ts`) and Task G1 wraps it
- `git(cwd, args, o?: { timeoutMs?: number; maxBuffer?: number })` — the release engine keeps calling it without options (unbounded, throwing).

- [ ] **Step 1: Write the failing tests** (all existing cases in the file must keep passing untouched):
  - recording port: the argv lists a custom port receives equal those the default port would run (three reads: `for-each-ref` with the tag format,
    `remote get-url origin`, `describe --long` + `DESCRIBE_FILTER`; `for-each-ref` carries `maxBuffer` 33554432).
  - port returning `null` for `for-each-ref` → `{ value: { current: null, releases: [] }, complete: false }`.
  - port returning `null` for `describe` only, on a repo with baseline + one release → releases length 2, `current: null`, `complete: false`.
  - branch cut before the baseline (HEAD not descending from any tag) → releases kept, `current: null`, `complete: false`.
  - port returning `null` for `remote get-url` with a GitHub-PR release → no `url` on it, `complete: true`.
  - repo with no version tags → empty shape, `complete: true`.
  - **Review Focus 1:** a port wrapping the default that trims stdout vs one that returns it untrimmed, on a repo whose tag message has CRLF endings and a
    trailing blank line → deep-equal results.
  - **Review Focus 2:** `v0.9.0` and `v0.10.0` tagged in the same second through a custom port → `releases[0].version === '0.10.0'`.
  - default port with `PATH` prefixed by a dir holding `fake-git.sh` as `git` (sleeps 30 s, traps TERM and kills its own `sleep`), `timeoutMs: 200` →
    resolves in under 2 000 ms with `complete: false` and the empty shape.
- [ ] **Step 2: Run** `npm test` — new cases fail.
- [ ] **Step 3: Implement.** Reader reads go through the port; `versionTags` gains a variant that takes the port (the release engine's `versionTags`
  call is unchanged); `null` from `for-each-ref` short-circuits to empty/incomplete; parsing tolerates a trailing `\n` after the last `\0`.
- [ ] **Step 4: Run** `npm test` and `npm run typecheck` — pass; `test/release.test.ts` untouched and green.
- [ ] **Step 5: Commit** `feat(releases): bound the reader and take a git port`.

### Task B2: `createReleasesReader` and `findRepoRoot`

**Files:** Create `src/releases-reader.ts`; Modify `src/index.ts`; Test `test/releases-reader.test.ts`; Modify `test/fixtures/repo.ts` (add
`worktree(path: string): string` that runs `git worktree add` and returns the path).

**Interfaces — Consumes:** B1's `readReleasesResult`, `GitPort`, `ReadOptions`. **Produces:**
- `createReleasesReader(opts: { root: string | (() => string | null) } & ReadOptions): ReleasesReader`
- `type ReleasesReader = { read(): Promise<ReleasesResponse> }`
- `findRepoRoot(from: string): string | null` (first ancestor holding a `.git` entry, file or directory)

- [ ] **Step 1: Write the failing tests.** A "read" = one `for-each-ref` launch on a recording port (spec Testing):
  - two sequential `read()` under one key → 1 read; two concurrent → 1 read.
  - commit after the first read → 2 reads and `current.ahead` goes 0 → 1.
  - annotated tag cut on an old commit without moving HEAD → 2 reads, new release present.
  - `git pack-refs --all` after the first read → 2 reads.
  - port returning `null` for `describe` (incomplete) → next `read()` re-reads (2 reads over 2 calls).
  - tagless checkout → 1 read over 2 calls (complete empty is memoised, spec D5).
  - one commit, no tags, no `packed-refs` → key built (no throw), memoised.
  - root function returning `null` → empty shape and the port is never called.
  - root function read per call: switch an env var between calls → second call reads the second repo.
  - linked worktree root → releases of the main checkout; a tag cut in the main checkout moves the key seen from the worktree.
  - port returning `null` for `rev-parse` → answer served, not memoised (2 reads over 2 calls).
  - `findRepoRoot`: from a nested dir of a repo → repo root; from a worktree subdir → worktree root (`.git` is a file); from `/` with no repo → `null`.
- [ ] **Step 2: Run** `npm test` — fail. **Step 3: Implement** per spec D4: key = root + HEAD + mtime of `packed-refs` + mtime of `refs/tags`, common
  dir resolved against root, missing path → `0`, async `stat`; in-flight entry shared per key and cleared only if still current.
- [ ] **Step 4: Run** `npm test`, `npm run typecheck` — pass. **Step 5: Commit** `feat(releases): memoised releases reader`.

### Task B3: Types under `moduleResolution: node`

**Files:** Modify `package.json` (top-level `"types": "./dist/esm/index.d.ts"`, `"main": "./dist/cjs/index.js"`; devDependency alias
`"typescript-5": "npm:typescript@5.9.3"` — release-kit's own TypeScript 7 rejects `moduleResolution: node` with TS5108, and 5.9.3 is what the Nest
apps compile with); Test `test/types-node10.test.ts`
with a fixture dir `test/fixtures/node10/` (a `tsconfig.json` with `moduleResolution: "node"`, `module: "commonjs"`, and two `.ts` files).

- [ ] **Step 1: Failing test:** the test links the package into a tmp `node_modules/release-kit` and runs `node_modules/typescript-5/bin/tsc --noEmit -p` on the fixture (never the root `tsc`): file 1
  `import { readReleases, createReleasesReader } from 'release-kit'` typechecks; file 2 `export * from 'release-kit/dist/esm/index'` inside a
  `declare module 'release-kit'` shim (guide-manager's exact shim) typechecks and still exports `readReleases`. Exit 0 = pass.
- [ ] **Step 2: Run** — fails (no `types`). **Step 3:** add the fields. **Step 4: Run** — pass. **Step 5: Commit** `fix(package): resolve types under
  node10`.

### Task B4: Bump script

**Files:** Create `scripts/bump-consumer.mjs`; Test `test/bump-consumer.test.mjs`.

**Interfaces — Produces:** `bumpConsumer(o: { pkg, repository, consumer, version, dir, run })` → `{ outcome: 'pinned' | 'open' | 'closed' |
'missing' | 'opened', pr?: number, closed: number[] }`, where `dir` is the consumer checkout and `run(cmd: string, args: string[], opts?) =>
Promise<{ code: number; stdout: string }>` is the only way it launches `git`, `gh`, `pnpm`, `npm`. CLI: reads `PKG`, `REPOSITORY`, `CONSUMER`,
`VERSION`, `VERSIONS` (newest-first, space-separated), `GH_TOKEN` from env, `dir` = cwd; exit 0 for every outcome but a failed command; prints a `::warning::` for `missing`.

- [ ] **Step 1: Failing tests** with a fake `run` recording calls and scripted `gh` answers; versions `v0.3.0` newest:
  - dependency already `github:futin/ui-kit#v0.3.0` → `pinned`, no `git push`, no `gh pr create`.
  - open PR on `bump/ui-kit-v0.3.0` → `open`, no push.
  - closed unmerged PR on that branch (declined) → `closed`, no push, no create.
  - closed merged PR on that branch → `closed`, no push.
  - branch exists on the remote, no PR → push is `--force`, PR created → `opened`.
  - behind, nothing exists → `package.json` dependency rewritten (other fields byte-identical, formatting kept), `pnpm install --lockfile-only` run for a
    `pnpm-lock.yaml` consumer, `npm install --package-lock-only` for a `package-lock.json` one, commit by `github-actions[bot]`, force-push,
    `gh pr create` with title exactly `chore(deps): bump ui-kit to v0.3.0`; body contains the retitle hint, an "After merge" line about refreshing
    `node_modules`, and, for a consumer pinned at `v0.1.0` with `VERSIONS` `v0.3.0 v0.2.0 v0.1.0`, exactly the two links
    `https://github.com/futin/ui-kit/releases/tag/v0.3.0` and `.../tag/v0.2.0` (every version above the pin, spec Part 1 step 3.4).
  - dependency under `devDependencies` → updated there.
  - dependency absent → `missing`, warning text exactly `futin/x does not depend on ui-kit yet`, no branch, exit 0.
  - open `bump/ui-kit-v0.2.0` PR, outcome `opened` → that PR closed with a comment naming the new PR number; `closed: [n]`.
  - already pinned and an older `bump/ui-kit-v0.2.0` open → closed with a comment saying the consumer is already on `v0.3.0`; no new PR.
  - outcome `open` (current PR exists) and an older `bump/ui-kit-v0.2.0` open → the older one closed (the unconditional half of spec step 4).
  - open `bump/ui-kit-v0.4.0` (newer than newest, a manual oddity) → left open.
  - `gh` answering 401 → exit 1 with a message naming `BUMP_TOKEN`.
- [ ] **Step 2: Run** `npm test` — fail. **Step 3: Implement**; the newest-version discovery stays out of this script (Task B5 passes `VERSION`).
- [ ] **Step 4: Run** — pass. **Step 5: Commit** `feat(bump): bump-consumer script`.

### Task B5: `bump-consumers.yml`, `self.yml` job and guards

**Files:** Create `.github/workflows/bump-consumers.yml`; Modify `.github/workflows/self.yml`; Test `test/workflows.test.mjs` (extend).

**Interfaces — Consumes:** B4's CLI env contract. **Produces:** `workflow_call` inputs `package`, `repository`, `consumers`, `kit-ref` (default `v1`),
secret `token`.

- [ ] **Step 1: Failing guard tests** (PyYAML-gated like the rest):
  - inputs are exactly those four with `kit-ref` default `v1`; `token` is a required secret.
  - a `version` job checks the caller out with `fetch-depth: 0` (and release-kit at `inputs.kit-ref` into `.release-kit`, since it runs kit code) and outputs the newest annotated `vX.Y.Z` as `version` and the full newest-first list as `versions` (ordered as `readReleases` orders them —
    the job runs `node .release-kit/dist/esm/...` or `readReleases` through a one-liner, builder's choice); no version → `::warning::` and the matrix is
    skipped.
  - the step running `bump-consumer.mjs` has exactly the env `PKG`, `REPOSITORY`, `CONSUMER` (from inputs/matrix), `VERSION` and `VERSIONS` (from
    `needs.version.outputs.version` / `.versions`), `GH_TOKEN` (from `secrets.token`).
  - `bump-consumers.yml` joins the fixed file lists of the existing "no job sets `name:`" and `setup-node` cache guards.
  - the matrix over `consumers` has `fail-fast: false`; it checks release-kit out at `inputs.kit-ref` into `.release-kit`; `setup-node@v5` has
    `package-manager-cache: false`; `COREPACK_ENABLE_DOWNLOAD_PROMPT: '0'` in env.
  - no `run:` contains `${{ inputs.` or `${{ github.event`; `secrets.token` appears only under `env:` of steps running `git`/`gh`/the script — so the
    consumer is cloned in a `run:` step (`gh repo clone` with `GH_TOKEN` in env), not by `actions/checkout` `with: token:`.
  - `self.yml` has job `bump` with `needs: release`, `if: github.event_name == 'push'`, `uses: ./.github/workflows/bump-consumers.yml`, `kit-ref:
    ${{ github.ref_name }}`, consumers exactly `futin/claude-agents-dashboard`, `futin/backlog-manager`, `futin/guide-manager`, secret from
    `secrets.BUMP_TOKEN`.
- [ ] **Step 2: Run** `npm test` — fail. **Step 3: Implement** both files. **Step 4: Run** — pass. **Step 5: Commit** `feat(bump): reusable
  bump-consumers workflow`.

### Task B6: README, dist

**Files:** Modify `README.md` (§Reading releases from a server rewritten around `createReleasesReader` with the git port and the Nest / raw-`http`
mounts as one-liners; new §Bump PRs: what opens one, how to decline one — close it —, the `BUMP_TOKEN` scopes, the consumer list, "Re-run jobs" as
the recovery); `dist/` via `npm run build`.

- [ ] **Step 1:** `npm run build`; **Step 2:** `npm test` (dist-drift green), `npm run typecheck`; **Step 3: Commit** `docs: reader and bump PRs`.
- [ ] **Step 4 (user gate):** open the Phase B PR with the title above; after merge and green, move `v1`; confirm the three `chore(deps): bump
  release-kit to v1.2.0` PRs opened and are green, then merge them (each app: also refresh its dev stack's `node_modules`).

---

## Phase C — ui-kit scaffold (spec Part 2 §Setup)

**Gate (user):** create public repo `futin/ui-kit`; edit the PAT to include it. Work happens in a fresh clone.

### Task C1: Scaffold

**Files (new repo):** `package.json` (name `ui-kit`, private, `type: module`, `exports` `.` → esm/cjs/types and `./styles.css` → `./dist/styles.css`,
top-level `types`/`main`, `files: ["dist"]`, peer `react ^18.3 || ^19`, devDeps `react`, `react-dom`, `@types/react`, `typescript`, the test runner,
`jsdom`, `vite`, `@vitejs/plugin-react`, `release-kit` `github:futin/release-kit#v1.2.0`); `tsconfig*.json` (`jsx: react-jsx`); `scripts/build.mjs`
(esm + cjs + `.d.ts` + copies `src/styles.css` to `dist/`); `src/index.ts` (empty export); `test/dist-drift.test.ts`; `.github/workflows/ci.yml`
(through `ci-node.yml@v1`, check commands `npm run typecheck` and `npm test`); `.github/workflows/release.yml` (README §Adopting releases shape) plus a
`bump` job `needs: release` calling `futin/release-kit/.github/workflows/bump-consumers.yml@v1` with `package: ui-kit`, `repository: futin/ui-kit`,
consumers the three apps, `token: ${{ secrets.BUMP_TOKEN }}`; `.github/pull_request_template.md` with `## What's new` above `## Why this shape`;
`README.md` (what it is, the token contract placeholder, how to consume, "Storybook later — trigger: first multi-state primitive"); `LICENSE` (MIT).

- [ ] **Step 1: Failing test:** dist-drift (copy release-kit's) plus a packaging test: `dist/esm/index.js`, `dist/cjs/index.js`, `dist/esm/index.d.ts`,
  `dist/styles.css` exist; no file under `dist/` contains `import '...css'` or `require('...css')`.
- [ ] **Step 2: Run** `npm test` — fail. **Step 3:** implement, `npm run build`. **Step 4:** `npm test`, `npm run typecheck` — pass.
- [ ] **Step 5: Commit** `chore: scaffold ui-kit` (no release: `chore`).
- [ ] **Step 6 (user gate):** PR green → read contexts (`ci / checks`, `ci / pr-title`, `ci / skills`) → merge → `apply-repo-settings.sh futin/ui-kit
  --dry-run` then real → add `BUMP_TOKEN` → tag baseline `v0.1.0` on the merge commit → dispatch `release.yml` with that sha.

### Task C2: release-kit lists ui-kit as a consumer

**Files:** release-kit `.github/workflows/self.yml` (consumers + `futin/ui-kit`), `test/workflows.test.mjs` (expected list), README consumer list.
- [ ] Test first (expected list gains `futin/ui-kit`), run red, edit, run green; commit `ci(bump): add ui-kit as a consumer`; PR (user gate).

---

## Phase D — ui-kit releases UI (spec Part 2 §Public surface)

One PR, title `feat(releases): version chip and What's new drawer` (cuts `v0.2.0`). Fixtures first (Task D1) because every later test uses them.

### Task D1: Wire types, fixtures, type contract

**Files:** Create `src/types.ts`, `fixtures/releases.ts`, `test/type-contract.test.ts` (a `.ts` file `tsc` checks; the test asserts `tsc` exit 0).

**Produces:** `ReleaseType = 'feat' | 'fix' | 'perf' | 'baseline'`; `Release { version; date; title; type; scope?; pr?; breaking; notes; url? }`;
`ReleasesResponse { current: { version: string; ahead: number } | null; releases: Release[] }`. Fixtures (plain data, named exports):
`baselineOnly`, `mixed` (newest first, as the route answers: `perf` `0.3.0` with long notes, `fix` `0.2.1` breaking, `feat` `0.2.0` with PR and url, baseline
`0.1.0`; `current: { version: '0.3.0', ahead: 0 }`), `noCurrent` (`mixed` with `current: null`), `empty` (`{ current: null, releases: [] }`), `hostileNotes` (notes with `<script>`, `<img onerror>`, `javascript:` link, an `&` in a
URL, a `)` in link text).
- [ ] Failing: a type-only file assigning a value of release-kit's `ReleasesResponse` to ui-kit's `ReleasesResponse` compiles under `npm run typecheck`; then implement; commit
  `feat(releases): wire types and fixtures`.

### Task D2: Pure logic

**Files:** Create `src/releases/logic.ts`; Test `test/logic.test.ts`. **Produces:** `isVersion(s: unknown): s is string`, `compareVersions(a, b):
number`, `chipLabel(current: { version: string; ahead: number }): string`, `displayTitle(title: string): string`, `TYPE_LABEL` (`feat` → `Feature`,
`fix` → `Fix`, `perf` → `Performance`), `dotState(newest: string | null, stored: string | null, open: boolean): { dot: boolean; seed: string | null }`,
`readLastSeen(key: string): string | null`, `writeLastSeen(key: string, v: string): void`, `formatReleaseDate(iso: string): string`,
`isReleasesResponse(v: unknown): v is ReleasesResponse`.
- [ ] **Failing cases** (spec Testing §pure logic): `dotState(null,'0.1.0',false)` → `{dot:false,seed:null}`; `('0.2.0',null,false)` → `{false,'0.2.0'}`;
  `('0.2.0','v0.2.0',false)` → `{false,'0.2.0'}`; `('0.3.0','0.2.0',false)` → `{true,null}`; `('0.2.0','0.2.0',false)` → `{false,null}`;
  `('0.3.0','0.2.0',true)` → `{false,'0.3.0'}`; `('0.2.0','0.3.0',true)` → `{false,null}`. `compareVersions('0.10.0','0.9.0') > 0`. `chipLabel` →
  `v0.2.0` (ahead 0), `v0.2.0+3`. `displayTitle('feat(rail)!: x')` → `x`, `('fix: y')` → `y`, `('Baseline — versioning starts here')` unchanged.
  `formatReleaseDate('2026-10-16T09:00:00Z')` → `16 Oct 2026`; `('junk')` → `junk`. `readLastSeen`/`writeLastSeen` with a throwing `localStorage` →
  `null` / no throw. `isReleasesResponse`: accepts `empty` and `mixed`; rejects `'<html>'`, `{ releases: {} }`, `{ current: { version: '1.0.0' },
  releases: [] }`.
- [ ] Run red → implement (port guide-manager's `client/src/lib/releases.ts` behaviour, key as parameter) → green → commit `feat(releases): pure logic`.

### Task D3: `renderNotesHtml`

**Files:** Create `src/releases/notes.ts`; Test `test/notes.test.ts`. **Produces:** `renderNotesHtml(md: string): string`.
- [ ] **Failing cases:** `<script>alert(1)</script>` → output contains `&lt;script&gt;` and no `<script`; `<img src=x onerror=alert(1)>` → no `<img`;
  `[x](javascript:alert(1))` → no `<a`; `[docs](https://e.com/a)` → exactly one `<a href="https://e.com/a" target="_blank" rel="noopener noreferrer">docs</a>`;
  `[q](https://e.com/"onmouseover="x)` → the `"` appears as `&quot;` inside the href, no `onmouseover=` attribute; **Review Focus 4:**
  `[a (b)](https://e.com/?x=1&y=2)` → one anchor whose href is `https://e.com/?x=1&amp;y=2`; `- one\n- two` → `<ul><li>one</li><li>two</li></ul>`;
  `` `a<b` `` → `<code>a&lt;b</code>`; `**bold**` → `<strong>bold</strong>`; `a\nb\n\nc` → `<p>a<br>b</p><p>c</p>`.
- [ ] Run red → implement (guide-manager's escape-first renderer, links built with `target`/`rel`) → green → commit `feat(releases): notes renderer`.

### Task D4: Hooks

**Files:** Create `src/releases/useReleases.ts`, `src/releases/useWhatsNew.ts`; Test `test/hooks.test.tsx` (jsdom, stubbed `fetch` and storage).
**Produces:** `useReleases(url = '/api/releases'): { data: ReleasesResponse | null; refresh(): void }`; `useWhatsNew(o: { storageKey: string; url?:
string }): { data: ReleasesResponse | null; chip: { label: string; dot: boolean } | null; open: boolean; show(): void; close(): void }`.
- [ ] **Failing cases:** first answer `mixed`, empty storage → `chip` `{ label: 'v0.3.0', dot: false }` and storage `0.3.0`; storage `0.2.1` then answer
  `mixed` → `dot: true`; `show()` → `open: true` synchronously, one extra fetch fired, `dot: false`, storage `0.3.0`; storage that throws → after the
  seed `dot: false`, no throw, still `false` after a re-render; refetch rejecting → `data` and `chip` unchanged; body `'<html>'` → previous data kept;
  `noCurrent` → `chip: null`; a `fetch` resolving after `unmount()` → nothing written to storage and `console.error` not called (spy), test exits cleanly; **Review Focus 3:** storage `0.9.0`, answer newest `0.5.0`, `show()`
  → storage still `0.9.0`; **Review Focus 5:** `show()` then the refetch rejects → `open` stays `true`, `data` is the earlier answer.
- [ ] Run red → implement → green → commit `feat(releases): useReleases and useWhatsNew`.

### Task D5: `Drawer`

**Files:** Create `src/ui/Drawer.tsx`; Test `test/drawer.test.tsx`. **Produces:** `Drawer(p: { label: string; onClose(): void; children: ReactNode;
closeOnEscape?: boolean; narrow?: boolean; restoreFocus?: false | ((prev: Element | null) => HTMLElement | null) })`. Markup: `div.uk-drawer-scrim` →
`aside.uk-drawer[role=dialog][aria-modal=true][aria-label][tabindex=-1]` (+ `uk-drawer--narrow`) → `button.uk-drawer-close[aria-label=Close]` + children.
- [ ] **Failing cases:** Escape on `document` → `onClose` once; `closeOnEscape={false}` → Escape does nothing and `document.addEventListener` was not
  called with `keydown`; ✕ click → `onClose`; scrim click → `onClose`; click inside the panel → not; on mount `document.activeElement` is the panel; on
  unmount focus returns to the button focused before mount; a removed opener → focus not moved to it; `restoreFocus={() => target}` → `target`
  focused; `restoreFocus={false}` → focus untouched; `narrow` → class present.
- [ ] Run red → implement → green → commit `feat(ui): Drawer shell`.

### Task D6: `VersionChip`, `ReleasesPanel`, `ReleasesDrawer`, `useMediaQuery`

**Files:** Create `src/releases/VersionChip.tsx`, `src/releases/ReleasesPanel.tsx`, `src/releases/ReleasesDrawer.tsx`, `src/ui/useMediaQuery.ts`;
Modify `src/index.ts` (export everything in spec Part 2 §Public surface); Test `test/releases-ui.test.tsx`.
**Produces:** `VersionChip(p: { label; dot; onClick(): void; className? })`; `ReleasesPanel(p: { data: ReleasesResponse; renderNotes?: (notes:
string) => ReactNode })`; `ReleasesDrawer(p: { data; onClose; renderNotes?; closeOnEscape?; narrow?; restoreFocus? })`; `useMediaQuery(query:
string): boolean` (false where `matchMedia` is missing).
- [ ] **Failing cases:** chip is a `button.uk-chip`; aria-label exactly `What's new — v0.3.0` / `What's new — v0.3.0, new release`; `.uk-chip-dot` only with `dot`; panel on
  `mixed`: entries in input order with `data-testid="release-<version>"`; baseline shows `Versioning starts here · v0.1.0` and `16 Oct 2026`-style date,
  no badge; `0.2.1` shows `Fix` and `Breaking` badges; title shown without its prefix; `PR #N` link only when both `url` and `pr`; head `What's new` and
  `running v0.3.0` (or `+N`); `noCurrent` → no `running`; empty notes → no `.uk-releases-notes`; custom `renderNotes` output replaces the default;
  `hostileNotes` through the default → no `<script>` in the DOM; `ReleasesDrawer` passes `closeOnEscape`, `narrow`, `restoreFocus` through (one case each);
  `useMediaQuery` follows a stubbed `matchMedia` change event.
- [ ] Run red → implement → green → commit `feat(releases): chip, panel and drawer`.

### Task D7: Stylesheet and tokens

**Files:** Create `src/styles.css`; Modify `README.md` (§Tokens: the full `--uk-*` list with each default, and a one-paragraph "how an app maps them");
Test extend `test/packaging.test.ts`.
- [ ] **Failing cases:** every `var(--uk-…)` in `src/styles.css` has a fallback (regex: no `var(--uk-[a-z0-9-]+)` without a comma); no `@media`; every
  class selector starts with `.uk-`; every token named in README appears in the CSS and vice versa. Minimum tokens (spec Part 2): panel background,
  ink, muted ink, hairline, scrim, accent, badge ink + tint for `feat`/`fix`/`perf`/`breaking`, font, mono font, radius, drawer width (default `400px`),
  z-index.
- [ ] Run red → implement (layout from guide-manager's `releases-*`/`ui-drawer-*` rules, colours as tokens; `uk-drawer--narrow` = full screen) → green
  → commit `feat(releases): stylesheet`.

### Task D8: Playground

**Files:** Create `playground/index.html`, `playground/main.tsx`, `playground/themes.css` (three approximate token maps labelled guide-manager,
backlog-manager, dashboard), `vite.config.ts`; `package.json` script `dev`. Not in `files`, not built by `scripts/build.mjs`.
- [ ] Packaging test case: no `dist/` path contains `playground`. `npm run dev` renders every fixture × three themes, each with a chip and an open
  panel; one button opens a real `ReleasesDrawer`. Verify by running it and looking (screenshot in the PR). Commit `chore(playground): fixtures under
  three themes`.

### Task D9: Packaging smoke, dist, README

- [ ] Packaging cases: `require(dist/cjs/index.js)` and `import(dist/esm/index.js)` both expose `ReleasesDrawer`, `useWhatsNew`, `renderNotesHtml`; React
  resolves from the consumer (peer), not bundled (no `react` code in `dist/`). `npm run build`; `npm test`; `npm run typecheck`. README §Consuming:
  install line, `import 'ui-kit/styles.css'` once in the client entry, the three host wrappers as one-line sketches (Escape stack, back gesture,
  default). Commit `docs: consuming ui-kit`. **User gate:** PR → merge → `v0.2.0` cut → three `chore(deps): bump ui-kit to v0.2.0` PRs are **not**
  opened (apps do not depend yet: green with warnings) — expected.

---

## Phases E–G — app migrations (spec Part 3)

One PR per app, in this order, each after its `chore(deps): bump release-kit to v1.2.0` merged. Title `refactor(releases): use release-kit's reader and
ui-kit's drawer`. Each phase is three tasks: **server**, **client**, **CSS + docs**. Common to all: `pnpm add github:futin/ui-kit#v0.2.0`; delete what
moved; keep tests of app wiring; delete tests whose subject moved; PR body `## After merge` with the app's own dependency-refresh step.

### Phase E — guide-manager

- **E1 server.** Modify `server/src/releases/releases.service.ts`: body becomes a `createReleasesReader({ root: releasesRoot })` held by the service,
  `read()` delegating; delete its `git`, `mtime`, `memoKey`, `boundedRead`, `READ_TIMEOUT_MS`; keep `releasesRoot()` (now using release-kit's
  `findRepoRoot`, which the service re-exports so `test/releases.e2e.test.ts`'s import keeps working). Try deleting `release-kit.d.ts` (spec D6) — keep it if `pnpm typecheck` or `nest build` fails, and say so in the PR. Test:
  `test/releases.e2e.test.ts` must pass unchanged; add one case "tagless checkout: two requests, one `for-each-ref`" only if the e2e harness can count
  (else skip — covered in B2). Run `pnpm test`, `pnpm typecheck`, `pnpm build:server`.
- **E2 client.** Delete `client/src/lib/releases.ts`, `hooks/useReleases.ts`, `components/ui/Drawer.tsx`; rewrite `components/ReleasesDrawer.tsx` as a
  wrapper: `ReleasesDrawer` from ui-kit with `restoreFocus` = the moved `restoreTarget`, `narrow = useMediaQuery('(max-width: 639px)')`, `renderNotes`
  = a `div.uk-releases-notes` whose HTML is `sanitizeSnapshot(renderNotesHtml(notes))`. `App.tsx` uses `useWhatsNew({ storageKey:
  'guide-manager.releases-last-seen' })`; `SideRail` renders `VersionChip` with `className="rail-version"` and an `onClick` that also closes the phone
  menu. `main.tsx` imports `ui-kit/styles.css`. Tests: `test/releases-ui.test.tsx` keeps the rail/menu cases (chip present, dot, menu closes on tap,
  no chip on `current: null`) rewritten against the new markup; `test/releases-lib.test.ts` deleted. Notes links keep `rel="noopener"` — one case.
- **E3 CSS + docs.** `shared/theme.css`: a `--uk-*` block per theme mapping onto existing tokens (`--green-ink`/`--green-tint` → feat, amber → fix,
  magenta → perf, red → breaking, `--scrim`, `--accent` → dot); delete `releases-*`, `ui-drawer-*`, `.rail-version-dot`/`.rail-version-label` rules from `styles.css`;
  `test/theme-tokens.test.ts` badge-contrast rows read the same pairs (unchanged values). Docs: `CLAUDE.md` releases invariant (no 10 s race, D5 memo),
  `releases.service.ts` header, README §Releases. `## After merge`: `pnpm run docker:sync`.

### Phase F — backlog-manager

- **F1 server.** `releases.service.ts`: `createReleasesReader({ root: releasesRoot, git: runGit })`; delete `compute`, the filters, `GITHUB`, `cmpVersion`,
  `memoKey`; `findRepoRoot` from release-kit, re-exported by the service for `test/api-releases.test.ts`. Delete `test/api-releases.test.ts`'s deep-equality-with-`readReleases` case; keep its route cases. Add one
  case: "every git launch in the route goes through `runGit`" (spy on the module) — the invariant. `test/git-run.test.ts`'s no-`*Sync` grep still green.
  Shim: as E1.
- **F2 client.** Delete `lib/releases.ts`, `hooks/useReleases.ts`, `components/ui/Drawer.tsx`; `ReleasesDrawer.tsx` wrapper calls
  `useDialogEscape(onClose)` and renders ui-kit's with `closeOnEscape={false}`, `narrow={useNarrow()}`, `renderNotes` = a `div` with
  `renderMarkdown(notes)`. App as E2 with `storageKey: 'backlog-manager.releases-last-seen'`; SideRail renders `VersionChip` with
  `className="rail-release"` (its existing class). Tests: `test/dialog-escape.test.tsx` keeps its existing "closes the What's new drawer over an open item
  modal" case green under `closeOnEscape={false}` + `useDialogEscape`; `releases-drawer.test.tsx` and `releases-app.test.tsx` keep wiring cases;
  `releases-lib.test.ts` deleted.
- **F3 CSS + docs.** `--uk-*` mapping in `styles.css` (cyan dot as today), delete `ui-drawer-*`, `releases-*` and `.rail-release-dot` rules;
  `test/daylight-contrast.test.ts` adds rows for the badge pairs from the mapping;
  `docs/subsystems/releases.md` (why-not-`readReleases` section replaced by "the git port"), `.claude/DESIGN.md` §8.7/§8.10, docs-sync stamp sources.
  `## After merge`: the builder states the step that actually refreshes its `node_modules` volume (check whether `docker:sync` does).

### Phase G — claude-agents-dashboard

This app's look changes by design (spec D16: ✕ moves to the corner, the baseline gains its date, the chip's aria-label changes), so its PR is titled
`fix(releases): use release-kit's reader and ui-kit's drawer` (spec Part 3's retitle rule), not `refactor`.

- **G1 server.** `server/lib/releases.ts`: a module-level reader from `createReleasesReader({ root: () => rootOverride ?? repoRoot(), git:
  countingPort })` where `countingPort` wraps release-kit's exported `defaultGitPort()` and counts `for-each-ref` launches; `overrideReleasesRoot` recreates
  the reader and resets the count; `releasesReadCount` returns it. `test/api-releases.test.ts` passes unchanged. `server-deps.test.ts` green (exact pin).
- **G2 client.** Delete `lib/releases.ts`'s moved functions (keep none unless something else imports them — grep), `hooks/useReleases.ts`;
  `ReleasesDrawer.tsx` wrapper calls `useBackClose(onClose)`, renders ui-kit's with `narrow={useNarrow()}`, `renderNotes={(t) => <Markdown text={t} />}`.
  App uses `useWhatsNew({ storageKey: 'dashboard.releases.lastSeen' })`; SideRail renders `VersionChip` with `className="rel-chip"`. Tests:
  `test/releases-client.test.ts` keeps app-specific cases; add "stored `0.9.0`, newest `0.5.0`, open → storage stays `0.9.0`" (the D17 fix) —
  deliberately duplicating ui-kit's D4 case as app-level proof the fix landed; do not delete it as a duplicate.
- **G3 CSS + docs.** `--uk-*` mapping in `client/src/styles.css`, delete `rel-*` drawer rules and `.rel-dot` (keep `.rel-chip` placement); re-shoot Playwright visual
  baselines for the drawer and chip (`pnpm test:visual --update-snapshots`, review the diff images in the PR); `docs/subsystems/releases.md`.
  `## After merge`: the dashboard's dependency refresh step.

---

## Done

Phase G merged; each app's chip shows the same version as before the migration and its dot state carried over; the next ui-kit release opens three bump
PRs on its own.
