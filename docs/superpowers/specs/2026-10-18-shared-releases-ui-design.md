# Shared releases UI — one version chip and What's new drawer for every app

Status: drafted 2026-10-18. Direction agreed with the user in conversation; every decision marked **(author's call)** is one the user has not made and
checks while reading. Parents: claude-agents-dashboard `docs/superpowers/specs/2026-10-15-release-pipeline-design.md` (the pipeline and the first chip),
backlog-manager `docs/superpowers/specs/2026-10-16-release-versioning-design.md`, guide-manager `docs/superpowers/specs/2026-10-17-release-versioning-design.md`.

## Intent

Three apps — claude-agents-dashboard, backlog-manager, guide-manager — each carry their own copy of the same feature: `GET /api/releases`, a version chip
at the foot of the side rail with an unseen-release dot, and a What's new drawer. The copies already drift: the dashboard's `markSeen` writes a version
*below* the stored one (the bug the two later copies fixed), backlog-manager re-implements release-kit's git reads to satisfy its bounded-git rule, and
guide-manager races `readReleases` against a timer because the reader has no timeout. The user wants **one component every project imports, so an update
reaches every project together**.

"Together" has a fixed meaning here, agreed in conversation: workflows already float on `@v1`, but code dependencies are lockfile-pinned by design, so the
closest honest match is **an automated "bump" PR in every consuming app on every release of a shared package**, gated by that app's own CI. Each app's
`package.json` `version` stays untouched — the annotated tag stays the only release record.

## Where the code lives (decided by the user)

Split by what changes together:

- **release-kit** keeps CI, the release workflow and the **server side** of releases: the tag reader, now bounded, and a memoised reader every server
  mounts. It sits next to the tag-message contract it reads.
- **A new repo, `ui-kit`** (`github:futin/ui-kit`), holds the **React side**: a generic `Drawer` shell and the releases UI (chip, panel, hooks, the pure
  client logic). It is the future home of the other parts the apps duplicate — `SideRail`, `Popover`, `Chevron`, `Select`… — but **none of those move in
  this project**; each gets its own spec later.
- **The bump automation** is a reusable workflow in release-kit, called by both packages' own CI after each release.

Why not one package: release-kit's `v1` is the workflows' contract (`ci-node.yml@v1`, `release.yml@v1`). A breaking prop change on a component would
force `v2` on every app's CI, UI churn would cut release-kit versions that change no CI, and a component library needs React, jsdom and CSS tooling a
Node-only CI kit does not. (Recorded so nobody "simplifies" it back later.)

## Goals

1. One implementation of: the bounded, memoised `/api/releases` read (release-kit); the chip, dot, drawer and notes rendering (ui-kit).
2. Each app keeps what is genuinely its own: its theme (a token mapping), where the chip sits, its Escape/dismiss layer, its notes renderer, its route.
3. A release of release-kit or ui-kit opens a bump PR in every consumer that is behind, without anyone remembering to.
4. backlog-manager stops re-implementing the git reads while its rule "every git read is `runGit`, async, bounded at 10 s" stays literally true.

## Non-goals

- Moving any other shared component (`SideRail`, `Popover`, `Select`, `Modal`, …) — later, one spec each.
- **Storybook.** Deferred by the user's agreement: v1 has three components; Storybook is dev-only, never enters `dist/` or the exports, so adding it later
  costs no consumer anything. The trigger to add it is the first multi-state primitive (`SideRail`, `Popover`, `Select`) moving in. v1's fixtures are
  plain data shaped so they can become stories unchanged.
- Publishing to npm. Both packages stay `github:` dependencies installed from a tag, with committed `dist/`.
- Moving the floating `v1` tag automatically **(author's call)** — it stays the manual step README §Moving `v1` describes.
- Auto-merging bump PRs **(author's call)**.
- Renovate or Dependabot (see D9).

## Anti-goals — what would make this a failure even if it works

- An app regresses on behaviour its copy already got right: the dot re-flagging releases after opening an older checkout; one Escape press in
  backlog-manager closing the drawer *and* the dialog under it; the chip vanishing for good after one transient git failure; a slow git hanging a route.
- A shared-package release reaching an app without passing that app's CI.
- The apps all looking like one app. Each keeps its own look through tokens; ui-kit ships structure and neutral defaults, not a brand.

## Decisions

| #   | Decision | Rejected |
| --- | -------- | -------- |
| D1  | **Two packages:** release-kit (server + CI), ui-kit (React). See "Where the code lives". | `release-kit/react` subpath; a monorepo |
| D2  | **`readReleases` gets bounded and observable**, signature kept: `readReleases(root, opts?)` with `opts.timeoutMs` (default 10 000, applied as `execFile`'s `timeout`, so a hung git is *killed*, not abandoned) and `opts.git` (a port, D3). New `readReleasesResult(root, opts?)` answers `{ value, complete }` — `complete` false when a read that decides the answer failed. `readReleases` is `readReleasesResult(...).value`. Still never rejects. | Racing a timer (guide-manager's approach: the child keeps running) |
| D3  | **The git port** `opts.git: (args: string[], o: { cwd: string; maxBuffer?: number }) => Promise<string \| null>` — stdout, or `null` for every failure. It is exactly `runGit`'s shape, so backlog-manager passes `runGit` and deletes its 168-line copy and its parity test. The default port is release-kit's own `git()` with the timeout, mapping rejection to `null`, and honouring `o.maxBuffer` instead of its own 256 MiB constant. Output may or may not be trimmed by the port; the reader must behave identically either way. The reader passes an explicit `maxBuffer` (32 MiB, backlog-manager's figure) on the `for-each-ref` read, because `runGit`'s default is `execFile`'s 1 MiB. **The port is the reader's only**: the release engine (`src/release.ts`) keeps calling `git()` directly, still throwing on failure and still unbounded, because a `null` there would make a failed read look like "no tags" and a 10 s kill on `git push` would be a new failure mode in the release workflow. | A timeout option alone (backlog's rule names `runGit`, and its timeout test seam `__setGitTimeoutMs` works through it) |
| D4  | **`createReleasesReader(opts)`** in release-kit: `opts.root` is a path or a function returning a path or `null` (read per call, so an env test seam like `GM_RELEASES_ROOT` keeps working); `opts.timeoutMs`, `opts.git` pass through. Answers `{ read(): Promise<ReleasesResponse> }`. Memo key: root + HEAD + mtimes of `packed-refs` and `refs/tags` under the **common** git dir, via `rev-parse HEAD --git-common-dir` through the same port. The common dir is resolved against `root` (git prints it relative to cwd in a main checkout); a path that does not exist (a fresh repo has no `packed-refs`) contributes `0`, as all three copies do; stats are async so the reader never blocks the event loop. A key git cannot produce is never memoised; only a `complete` answer is memoised; concurrent calls under one key share one read; an in-flight read is dropped only if still the current one. Also exported: `findRepoRoot(from)`. No HTTP code — each app mounts `read()` in its own framework in a few lines. | A Node `http` handler (two apps are Nest, the dashboard is raw `http`; the handler is the part that differs) |
| D5  | **`complete` semantics** (backlog-manager's, now everyone's): `for-each-ref` failing → empty shape, incomplete. No version tags → empty shape, **complete** (so a tagless checkout is memoised — this fixes guide-manager's re-read per request). `describe` failing or finding no reachable tag while releases exist → `current: null`, releases kept, incomplete. `remote get-url` failing or a non-GitHub origin → no `url`, still complete. | guide-manager's "memoise only non-empty" (it could not tell failure from no tags) |
| D6  | **Types resolve under `moduleResolution: "node"`** via `typesVersions` in both packages' `package.json`, so guide-manager and backlog-manager delete their `declare module 'release-kit'` shims. If `typesVersions` proves insufficient under `nest build`, the shim stays and this is noted in the migration PR — not a blocker. | Keeping the shims as the plan |
| D7  | **ui-kit ships ESM + CJS + `.d.ts`, committed `dist/`**, release-kit's pattern (`scripts/build.mjs`, a dist-drift test). CJS because guide-manager and backlog-manager test with Jest (ts-jest, CommonJS), which cannot load an ESM-only package from `node_modules` without per-app transform config. Components **never import CSS**; the host imports `ui-kit/styles.css` once from its client entry, so Jest never sees a `.css` import. `react` (`^18.3 \|\| ^19`) is a peer dependency; no `react-dom` peer (no portals). npm, not pnpm, like release-kit **(author's call)**. | ESM only; CSS imported by components |
| D8  | **Bump PRs come from a reusable workflow in release-kit**, `.github/workflows/bump-consumers.yml`, called by a `bump` job in each shared package's own CI after its `release` job. Details in Part 3. | A tag-triggered workflow — tags pushed with `GITHUB_TOKEN` trigger no workflows, and the release job pushes with it |
| D9  | **Not Renovate or Dependabot.** Neither documents updating `github:owner/repo#vX.Y.Z` dependencies together with a pnpm 12 lockfile (searched 2026-10-18; nothing authoritative either way), and both are an extra app to install and configure in every repo. Revisit if either documents it. | Renovate (`github-tags` datasource), Dependabot |
| D10 | **Bump PR title `chore(deps): bump <package> to vX.Y.Z`** **(author's call)** — `chore` cuts no app release. When a bump changes something the app's users see (a drawer change), the human merging it retitles it `fix`/`feat` and writes the What's new section; the PR body says so. | `fix(deps)` (every bump becomes a release whose note is "bump release-kit"); mirroring the package's own type (most kit releases touch only CI) |
| D11 | **Bump PRs are opened, never merged** by the workflow **(author's call)**. | Squash auto-merge on green |
| D12 | **Credential: a fine-grained PAT** stored as secret `BUMP_TOKEN` in release-kit and in ui-kit **(author's call)**, scoped to the consumer repos, permissions Contents: read/write, Pull requests: read/write and Issues: read/write (the superseded-PR comment goes through the issue-comments API) (no Workflows permission — a bump touches only `package.json` and the lockfile). A PAT and not `GITHUB_TOKEN` because a PR opened with `GITHUB_TOKEN` starts no CI, and CI is the gate. Expiry is the cost; the workflow fails loudly (D8) when it lapses. | A GitHub App (more setup; worth it only if rotation becomes a chore) |
| D13 | **ui-kit's look is tokens + fixed class names.** Every class is `uk-*`; every colour, size and font the shipped CSS uses is a `--uk-*` custom property with a neutral fallback (`var(--uk-ink, #222)`). The shipped CSS has **no media queries** — custom properties cannot drive one, and the three apps break at 640, 700 and 768 px — so the phone shape is a `narrow` prop (D15). Each app maps `--uk-*` onto its own tokens in its own stylesheet; each app's contrast tests stay in that app, over its own token values. **(author's call:** prefix `uk-`, not the `rk-` floated earlier, since it is ui-kit's.) | Shipping a theme; CSS-in-JS |
| D14 | **Each app keeps its notes renderer**, through a `renderNotes(notes) => ReactNode` prop (`renderMarkdown` and guide-manager's renderer return HTML strings; those hosts wrap the string in their own `dangerouslySetInnerHTML` element, as both do today): the dashboard its `<Markdown>`, backlog-manager its `renderMarkdown`, guide-manager its escape-first renderer + `sanitizeSnapshot`. ui-kit's default is the escape-first renderer guide-manager wrote (spec D5 there), which now itself emits `target="_blank" rel="noopener noreferrer"` on each link, since there is no app sanitiser behind it. | One renderer for all (would change notes rendering in two apps and drop guide-manager's second wall) |
| D15 | **The drawer accepts the host's dismiss and focus layer instead of owning it.** `Drawer` props: `label`, `onClose`, `children`, `closeOnEscape` (default `true`: one `keydown` listener of its own; `false`: no key handling at all), `narrow` (adds `uk-drawer--narrow`), `restoreFocus` (default: focus returns to the element focused before opening if it is still connected; a function `(prev) => HTMLElement \| null` picks the target; `false` moves nothing on close). On open, focus moves to the panel. A host with a dialog stack wraps it: backlog-manager's wrapper calls `useDialogEscape(onClose)` and passes `closeOnEscape={false}`; the dashboard's wrapper calls `useBackClose(onClose)` and keeps the default. No hook is passed as a prop. | A `useDismiss` hook prop (hooks-as-props break silently when the prop changes); the drawer owning a stack |
| D16 | **One markup for all apps**, guide-manager's (the newest port): ✕ in the panel's top-right corner; head `What's new` + `running v0.2.0+1`; entry = version, type badge, a separate Breaking badge, date, title without its `type(scope)!: ` prefix, notes, `PR #N`. The baseline is a divider with its date. The dashboard therefore loses its in-head ✕, gains the baseline's date, and its chip's aria-label changes from `Running v…, new releases — open What's new` to `VersionChip`'s wording. backlog-manager's drawer, which moves no focus today, takes D15's focus defaults **(author's call)**. | Per-app markup variants |
| D17 | **Each app keeps its existing `localStorage` key**, passed in (`dashboard.releases.lastSeen`, `backlog-manager.releases-last-seen`, `guide-manager.releases-last-seen`), so no viewer's dot state resets. The dashboard adopts `dotState`'s "never write a version below the stored one" — an intended fix. | One shared key |
| D18 | **v1 preview: shared fixtures + a dev-only playground** (user's pick). `fixtures/` (plain data, not exported) feeds the tests and `playground/` — a Vite page (`npm run dev`) rendering every fixture under three token mappings that approximate the three apps' themes, side by side. Neither enters `dist/` or `files`. | Storybook now; fixtures only |
| D19 | **ui-kit defines the wire types itself** and dev-depends on release-kit only to prove, at compile time, that release-kit's `ReleasesResponse` is assignable to its own. No runtime dependency between the packages, so a ui-kit bump never drags a release-kit bump along. ui-kit is therefore one of release-kit's bump consumers. | A runtime dependency; types copied without a check |

## Part 0 — prerequisite (claude-agents-dashboard, one small PR, before Part 1 merges)

`test/server-deps.test.ts` pins `release-kit` to the literal `github:futin/release-kit#v1.1.0`, so every bump PR would fail that app's CI. Its intent is
"no floating ref" (its own comment: a floating ref lets server code change without a lockfile diff). Loosen it to "pinned to an exact `#vX.Y.Z`"
(`^github:futin/release-kit#v\d+\.\d+\.\d+$`), which keeps the intent, with cases: `#v1.1.0` and `#v1.2.0` pass; `#v1`, `#main`, no ref and a
`#v1.2.0-rc1` fail **(author's call)**. Title `test(deps): accept any exact release-kit tag`. The other two apps have no such test (checked
2026-10-18).

## Part 1 — release-kit (one PR, `feat(releases): bounded reader, memoised reader and bump-consumers workflow`)

That title cuts `v1.2.0`. After it is green, the user moves `v1` (README §Moving `v1`) so `bump-consumers.yml@v1` exists for ui-kit to call.

### Server API (root export, esm + cjs)

- `git()` gains an optional timeout option, unused by the release engine. The reader's reads (`versionTags` as the reader uses it, `describe`, `remote
  get-url`, the memo key's `rev-parse`) go through the port (D3); the release engine's calls are unchanged and `release.test.ts` must pass untouched.
- `readReleases(root, opts?)`, `readReleasesResult(root, opts?)` (D2, D5), `createReleasesReader(opts)` and `findRepoRoot(from)` (D4).
- `writeReleasesJson` keeps working, bounded by the default timeout.
- Exported types gain `ReadOptions`, `GitPort`, `ReleasesReader`.
- `package.json` gains `typesVersions` (D6).
- README §Reading releases from a server is rewritten around `createReleasesReader`, with the two mounting shapes (Nest controller, raw `http`) as
  one-line sketches, plus the git port for a server with its own bounded launcher.

### Bump workflow

`.github/workflows/bump-consumers.yml`, `workflow_call`:

- Inputs:
  - `package`: the dependency name, `release-kit` or `ui-kit`.
  - `repository`: `owner/name`.
  - `consumers`: newline-separated `owner/name`.
  - `kit-ref`: default `v1`. The release-kit ref the workflow checks out (into `.release-kit`, as `release.yml` does) to run the bump script from.
    `self.yml` passes `${{ github.ref_name }}` like its other jobs, so Part 1's own merge runs the script it just merged even though `v1` does not
    have it yet; ui-kit passes `v1`, keeping it equal to its `uses:` ref.
- Secret: `token`.
- **Version:** the newest annotated `vX.Y.Z` tag in the calling repo, computed the way `readReleases` orders them. No version means the workflow
  ends green with a warning.
- **One matrix job per consumer**, `fail-fast: false`:
  1. Check out the consumer's default branch with the token.
  2. Find the dependency in `dependencies` or `devDependencies`.
     - Missing → done, green, with the warning `<consumer> does not depend on <package> yet` **(author's call)**. A consumer is listed before
       it adopts the package (ui-kit lists all three apps from day one), and failing would keep the package's `main` red until every migration lands.
     - Already `github:<repository>#<version>` → done, green.
     - An open PR from branch `bump/<package>-<version>` exists → done, green.
     - A **closed** PR from that branch exists, merged or not → done, green. Closing a bump PR unmerged is how a human declines that version; the
       next version's PR is opened as usual.
     - The branch exists with no PR at all (a run cancelled between push and PR create — `self.yml`'s `cancel-in-progress: true` does this) → carry on
       below; the branch is deterministic and bot-owned, so step 3 **force-pushes** it.
  3. Otherwise, update it:
     1. Set the spec to `github:<repository>#<version>`.
     2. Update the lockfile with the consumer's own package manager: `corepack enable`, then `pnpm install --lockfile-only` for `pnpm-lock.yaml` or
        `npm install --package-lock-only` for `package-lock.json`.
     3. Commit as `github-actions[bot]` and force-push the branch.
     4. Open the PR with D10's title. Its body links the package's GitHub Release for each version skipped over and says how to retitle.
  4. Close older open `bump/<package>-*` PRs in that consumer as superseded, with a comment naming the new PR **(author's call)**.
- **Idempotent:** a re-run, or a run on a push that released nothing, only opens what is missing. So the caller's `bump` job runs on every push to `main`
  after `release`, and needs no "did this run release?" output from the release CLI. There is no `workflow_dispatch` path (in `self.yml` `release` is
  push-only, so a `needs: release` job would be skipped on a dispatch). A missed run is recovered by "Re-run jobs" on that push's run, or by the next push.
- **Same safety rules as `release.yml`:** no PR title, body or version reaches a `run:` through `${{ }}` — everything goes through env or argv. The token
  is used only by `git` and `gh`.
- **A missing or expired token** fails the job with a message naming `BUMP_TOKEN`.
- `self.yml` gains `bump` (`needs: release`, push only) with the consumers `futin/claude-agents-dashboard`, `futin/backlog-manager` and
  `futin/guide-manager`. `futin/ui-kit` (which dev-depends on release-kit for its types, D19) is added by a one-line release-kit PR once that repo
  exists — a fine-grained PAT cannot be scoped to a repo that does not exist yet.
- The PR body carries an **After merge** line: the lockfile changed, so refresh the dev stack's `node_modules` the way that app's README says
  (guide-manager's `docker:sync` drops the named volume; the builder confirms what backlog-manager's and the dashboard's stacks need and the body
  says it generically rather than per app).
- **User step before Part 1 merges:** create the PAT and add it as `BUMP_TOKEN` in release-kit; later edit the same PAT to include `futin/ui-kit`
  and add it to ui-kit too.

## Part 2 — ui-kit (new public repo)

### Setup — user steps; the session never creates the repo or the secret

1. Create `futin/ui-kit` (public).
2. Land the scaffold PR. It contains `ci.yml` through `ci-node.yml@v1`, `release.yml` through `release.yml@v1`, a PR template with `## What's new`, a
   README, the build and the tests.
3. Apply `scripts/apply-repo-settings.sh futin/ui-kit` (dry run first) per release-kit's adoption checklist.
4. Tag the baseline `v0.1.0`, then dispatch the release workflow on it so the baseline gets its GitHub Release (README §Adopting releases, step 3).
5. Add the `BUMP_TOKEN` secret.

The scaffold PR is the first one, so it lands before the ruleset exists — the checklist only requires its contexts to have reported first. The releases UI lands as the second PR,
`feat(releases): version chip and What's new drawer`, cutting `v0.2.0`.

### Public surface (one export `.`, plus `./styles.css`)

- **Wire types** — `Release`, `ReleaseType`, `ReleasesResponse`, defined in ui-kit, not imported, because the contract is the JSON on the wire. D19: a
  type-level test asserts release-kit's exported `ReleasesResponse` is assignable to ui-kit's (release-kit is a devDependency only).
- **Pure logic, no React:**
  - Versions and labels: `isVersion`, `compareVersions`, `chipLabel`, `displayTitle`, `TYPE_LABEL`.
  - Dot and storage: `dotState`, `readLastSeen(key)` and `writeLastSeen(key, v)`, both try/catch.
  - Rendering: `formatReleaseDate`, `renderNotesHtml` (the escape-first renderer, D14), and `isReleasesResponse`.
  - Behaviour is guide-manager's `client/src/lib/releases.ts` (its `renderNotes` renamed `renderNotesHtml`) plus `isReleasesResponse` from its
    `hooks/useReleases.ts`, function for function, with the storage key now a parameter. `chipLabel` takes a non-null `current`, as there.
- **Hooks:**
  - `useReleases(url = '/api/releases')`: fetch on mount and on `refresh()`, no poll, a late answer after unmount dropped, a failed or wrong-shaped
    body keeping the last good answer.
  - `useWhatsNew({ storageKey, url? })`: the wiring every `AppShell` repeats. It returns `{ data, chip, open, show, close }`.
    - `chip` is `{ label, dot }`, or `null` while `current` is null.
    - `show()` fires a refresh and opens immediately, without waiting for the answer, as all three apps do today.
    - It keeps the in-memory mirror of the stored value, so storage that throws still settles the dot.
    - Every write goes through `dotState`.
- **Components:**
  - `VersionChip` renders `{ label, dot, onClick, className? }` as a `<button class="uk-chip">` with a `uk-chip-dot`. Its aria-label is
    `What's new — v0.2.0` or `What's new — v0.2.0, new release`. Placement is the host's: the host passes `className` and wraps `onClick`, as
    guide-manager does to close its phone menu.
  - `Drawer` (D15).
  - `ReleasesPanel` renders `{ data, renderNotes? }`, the drawer's content (D16).
  - `ReleasesDrawer` renders `{ data, onClose, renderNotes?, closeOnEscape?, narrow?, restoreFocus? }`, which is `Drawer` + `ReleasesPanel`.
  - `useMediaQuery(query)` is a small helper so a host can derive `narrow` from its own breakpoint.
- **Tokens (`--uk-*`), the minimum the shipped CSS reads**:
  - Surfaces and ink: panel background, ink, muted ink, hairline, scrim, accent (the dot).
  - Badges: `feat`, `fix`, `perf` and `breaking`, each as an ink + tint pair.
  - Type and size: font, mono font, radius, drawer width (default 400 px) and z-index.
  - The builder may add tokens; each one needs a fallback.

### Not exported

`fixtures/`, `playground/` (D18).

## Part 3 — migration (one PR per app, in this order; each after ui-kit `v0.2.0` and release-kit `v1.2.0` exist)

The PR titles are `refactor(releases): use release-kit's reader and ui-kit's drawer`. `refactor` cuts no release; retitle it `fix` if the look
changed visibly in that app **(author's call)**.

**Order inside each app (author's call):** Part 1's merge opens a `chore(deps): bump release-kit to v1.2.0` PR in every app on its own. That one
merges first — `readReleases`' signature is unchanged, so it is a no-op for the app — and the migration PR then builds on it, so the two never
conflict.

Every PR does the following:

- Adds `ui-kit` at `#v0.2.0` (release-kit is already at `#v1.2.0` from the bump PR).
- Replaces the server service's body with `createReleasesReader`, keeping the route, its always-200 contract and the env root seam.
- Deletes the client lib, the hook, the drawer and the drawer shell.
- Rewires `AppShell` onto `useWhatsNew` and the chip onto `VersionChip`.
- Imports `ui-kit/styles.css` and adds a `--uk-*` mapping block in the app's theme.
- Deletes the now-dead `releases-*` / `rel-*` / `ui-drawer-*` CSS.
- Keeps the app tests that cover the app's own wiring (chip placement, phone menu closing, the route e2e) and deletes the tests whose subject moved to
  release-kit or ui-kit.
- Updates the docs that described the copy.

Per-app specifics:

1. **guide-manager**:
   - `restoreFocus` is its `restoreTarget` (the ☰ fallback).
   - `narrow` comes from `useMediaQuery('(max-width: 639px)')`.
   - `renderNotes` stays the escape-first renderer + `sanitizeSnapshot`.
   - Its 10 s race goes away (the reader is bounded), and so does "only an answer with releases in it is memoised" (D5) — both are stated in its
     `CLAUDE.md` and `releases.service.ts`'s header, which the PR updates.
   - PR body `## After merge`: `pnpm run docker:sync` — the image is unchanged but the lockfile gained ui-kit, and the dependencies live in a named
     volume that `docker:sync` drops. backlog-manager and the dashboard get the equivalent step for their own stacks (the builder checks whether
     backlog-manager's `docker:sync`, which does not remove its volume, actually picks up a new dependency).
2. **backlog-manager**:
   - The wrapper calls `useDialogEscape` and passes `closeOnEscape={false}`, so it stays the sixth entry on the Escape stack.
   - `narrow` comes from `useNarrow()`.
   - `renderNotes` is `renderMarkdown`.
   - The reader gets `git: runGit`.
   - It deletes the parity test against `readReleases`, since there is now one implementation.
   - Updates `docs/subsystems/releases.md` and `.claude/DESIGN.md` §8.7 (the Drawer shell now comes from ui-kit). The `runGit` invariant is unchanged.
3. **claude-agents-dashboard**:
   - The wrapper calls `useBackClose`.
   - `narrow` is its `md` breakpoint (`(max-width: 767px)`).
   - `renderNotes` is `<Markdown text>`.
   - `overrideReleasesRoot` and `releasesReadCount` survive as a thin layer over `createReleasesReader`, using a counting git port for the read count.
   - Adopts D17's no-lower-write fix.
   - Its Playwright visual baselines for the drawer are re-shot in that PR.

## Testing

Behaviour and cases, not code. Fixtures are tmpdir git repos from release-kit's existing `makeRepo` (`test/fixtures/repo.ts`), which sets a local
identity, so CI needs none.

### release-kit, `readReleasesResult`

All existing `readReleases` cases still pass unchanged. New cases:

- The default port with a fake `git` on `PATH` that sleeps past `timeoutMs` → the child is killed and `for-each-ref` counts as failed: empty shape, incomplete, and the call
  resolves within roughly `timeoutMs`.
- A custom port returning `null` for `for-each-ref` → empty shape, incomplete.
- A port returning `null` for `describe` only → releases kept, `current: null`, incomplete.
- No reachable tag from HEAD (a branch cut before the baseline) → releases kept, `current: null`, incomplete.
- A port returning `null` for `remote get-url` → no `url`, complete.
- No version tags → empty shape, complete.
- A port that returns untrimmed stdout and one that trims → deep-equal answers.
- Every argv the default and a custom port receive is identical (a recording port).

### release-kit, `createReleasesReader`

Each case counts reads with a recording port; a "read" is one `for-each-ref` launch (the memo key's `rev-parse` runs on every call and is not one):

- Two calls under one key → one read.
- Two concurrent calls → one read.
- A commit after the first call → two reads, `ahead` moves.
- A tag cut without moving HEAD → re-read.
- A tag moved into `packed-refs` by `git pack-refs --all` → re-read.
- An incomplete answer → re-read on the next call.
- A tagless checkout → one read across two calls (D5).
- A root function returning `null` → empty shape, no git launched.
- A root that is a linked worktree (`git worktree add`) → reads the main checkout's tags and keys on the common dir.
- `rev-parse` failing → no memo, answer still served.

### release-kit, the bump workflow

Covered by the existing YAML guard tests (`test/workflows.test.mjs` pattern):

- No `${{ }}` inside any `run:` carries `inputs.*` or event text.
- The secret is referenced only in `env:` of the steps that run `git` or `gh`.
- The matrix has `fail-fast: false`.

The idempotence logic is a small script under `scripts/` (Node, like `pr-title.mjs`), so it gets unit tests with a fake `gh`/`git` runner:

- Already pinned → no PR.
- An open PR on the branch → no PR.
- A closed, unmerged PR on the branch (declined) → no PR, no push, exit 0.
- The branch exists with no PR → force-pushed and a PR opened.
- Behind → branch, commit and PR with the exact title `chore(deps): bump ui-kit to v0.3.0`.
- An older open `bump/ui-kit-v0.2.0` → closed with a comment.
- The dependency missing → exit 0 with the warning `futin/x does not depend on ui-kit yet`, no branch, no PR.
- The dependency in `devDependencies` → updated there.

Proven end to end once by the first real release after the merge.

### ui-kit, pure logic

Ported from guide-manager's `test/releases-lib.test.ts` case for case.

`dotState`:

- No newest.
- First visit → seeds the newest.
- A stored value that isn't a version → seeds the newest.
- Newer → dot.
- Equal → no dot.
- Drawer open with a newer release → seeds the newest.
- Drawer open with a newest below the stored one → no seed.

Labels and versions:

- `compareVersions('0.10.0', '0.9.0') > 0`.
- `chipLabel` gives `v0.2.0` and `v0.2.0+3`.
- `displayTitle` on `feat(rail)!: x`, `fix: y` and a prefixless baseline title.
- `formatReleaseDate` on an ISO date and on junk, which comes back as it came.

`renderNotesHtml`:

- `<script>` and `<img onerror>` arrive as text.
- A `javascript:` link is not a link.
- An `https://` link carries `target="_blank"` and `rel="noopener noreferrer"`.
- A quote in a URL cannot leave the `href`.
- Bullets become `<li>`; inline code, bold and paragraphs render.

`isReleasesResponse` accepts the empty shape and a full shape, and rejects an HTML string, `{ releases: {} }` and a `current` missing `ahead`.

### ui-kit, components (jsdom)

`ReleasesPanel`:

- Renders entries in the given order, with the baseline divider showing its date.
- Breaking shows its own badge.
- `PR #N` appears only with both `url` and `pr`.
- A custom `renderNotes` replaces the default.
- Empty notes render no notes element.

`Drawer`:

- Escape closes it by default.
- With `closeOnEscape={false}`, Escape does nothing and no `keydown` listener is attached.
- ✕ and a scrim click close it; a click inside the panel does not.
- Focus goes to the panel on open.
- On close, focus returns to the opener by default, goes to the function's target when one is given, and moves nowhere with `false`.
- `narrow` adds the class.

`VersionChip`: the dot and the aria-label with and without `dot`.

`useWhatsNew`, with a stubbed `fetch` and storage:

- A first answer seeds and shows no dot.
- A newer release on a later answer shows the dot.
- `show()` refetches, opens and clears the dot.
- Storage that throws → no dot after the seed, no crash.
- A failed refetch keeps the chip.
- A null `current` → no chip.

### ui-kit, other checks

- **Type contract (D19):** `tsc` fails if release-kit's `ReleasesResponse` stops being assignable to ui-kit's.
- **Packaging:**
  - The dist-drift test.
  - A smoke test that `require('ui-kit')` (cjs) and `import('ui-kit')` (esm) both expose `ReleasesDrawer`.
  - No file under `dist/` imports `.css`.

### Apps

Their remaining wiring tests pass. Each migration PR's merge is the end-to-end proof: the chip shows the same version as before, and the dot state
carries over (D17).

## Left to the builder

- The test runner inside ui-kit: `node:test` + tsx like release-kit with a jsdom global, or vitest if that fights jsdom/React. It must run through
  `ci-node.yml`'s `check-commands`.
- File layout inside both packages.
- The exact `--uk-*` token names beyond the minimum list.
- The playground's three approximate palettes.
- The bump script's internal shape.

## Out of scope

`CHANGELOG.md`; versioning `package.json`; moving `v1` automatically; per-project releases of anything an app manages (each chip is the app's own
version); any `git fetch` or GitHub API call from an app server; shared server routing code.
