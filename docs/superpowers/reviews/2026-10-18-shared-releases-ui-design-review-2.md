# Review 2 — Shared releases UI design spec

Document: `docs/superpowers/specs/2026-10-18-shared-releases-ui-design.md` (391 lines, at commit `1a90354`, after review 1 was addressed). Reviewer: Fable 5.1,
2026-10-18. Read-only; the document was not edited.

Code checked. release-kit: `src/git.ts`, `src/read-releases.ts`, `src/release.ts`, `src/index.ts`, `src/conventional.ts`, `package.json`, `tsconfig*.json`,
`scripts/*`, `rulesets/main.json`, `.github/workflows/{self,release,ci-node}.yml`, `test/workflows.test.mjs`, `test/dist-drift.test.ts`, `test/fixtures/repo.ts`,
README (§Adopting it in an app, §Adopting releases, §Reading releases from a server, §Moving `v1`). guide-manager: `client/src/lib/releases.ts`,
`hooks/useReleases.ts`, `components/ui/Drawer.tsx`, `components/ReleasesDrawer.tsx`, `components/SideRail.tsx`, `App.tsx`, `lib/sanitize.ts`,
`server/src/releases/releases.service.ts`, `server/src/releases/release-kit.d.ts`, `tsconfig.json`, `jest.config.ts`, `package.json`, `test/releases-lib.test.ts`,
CLAUDE.md. backlog-manager: `server/src/git-run.util.ts`, `server/src/releases/*`, `client/src/hooks/{useNarrow,useDialogEscape}.ts`, `components/ui/Drawer.tsx`,
`components/ReleasesDrawer.tsx`, `lib/markdown.ts`, `App.tsx`, `tsconfig.json`, `package.json`, `test/api-releases.test.ts`, `test/git-run.test.ts`,
`docs/subsystems/releases.md`, `.claude/DESIGN.md` §8.7, CLAUDE.md, `.claude/rules/{security,tests}.md`. claude-agents-dashboard: `test/server-deps.test.ts`,
`test/api-releases.test.ts`, `client/src/lib/releases.ts`, `hooks/{useReleases,useBackClose,useNarrow}.ts`, `components/{ReleasesDrawer,SideRail,Markdown}.tsx`,
`App.tsx`, `server/lib/releases.ts`, `server/index.ts`, `shared/types.ts`, `client/src/styles.css`, `package.json`, `docker-compose.dev.yml`, `.claude/CLAUDE.md`.
The D6 claim was tested by running `tsc` 5.9.3 (backlog-manager's) over a scratch `node_modules/release-kit` with each `typesVersions` shape (details under C1).

## Verdict

**REVISE** — one Critical (the `typesVersions` D6 adds in Part 1 breaks the ambient shim both Nest apps keep until Part 3, so the "no-op" bump PR the migration
order rests on fails typecheck in two of three apps), five Important. Everything else review 1 verified still holds; the review-1 fixes landed as described.

## What checked out (so the author need not re-verify)

- Intent: dashboard `markSeen` writes unconditionally (`client/src/lib/releases.ts:86-93`); backlog-manager's service is 168 lines and re-runs the four reads
  through `runGit`; guide-manager's `boundedRead` races a timer and leaves the child running (`releases.service.ts:77-93`); release-kit's `git()` has no `timeout`
  and a 256 MiB `maxBuffer` (`src/git.ts:15`). `release.ts` calls `git()` directly, including `push` (`src/release.ts:74-75`).
- D2/D3/D5: `readReleases(repoRoot)` never rejects (`read-releases.ts:44-62`); `runGit(args, { cwd?, maxBuffer? }) => Promise<string | null>`
  (`git-run.util.ts:70`), default `maxBuffer` is execFile's 1 MiB (`:54`), `MAX_BUFFER = 32 MiB` (`releases.service.ts:47`), `__setGitTimeoutMs` (`:46`).
  D5's four outcomes match `compute()` line for line (`releases.service.ts:105-141`). The "trimmed or not" rule matters: `LONG_DESCRIBE` is anchored with `$`
  and no `m` flag, so an untrimmed `describe` would never match — the test at L266 catches exactly this.
- D4: both Nest copies key on root + HEAD + `packed-refs`/`refs/tags` mtimes via `rev-parse HEAD --git-common-dir`, resolve the common dir against root, and
  return `0` for a missing path (`backlog releases.service.ts:82-97`, `guide releases.service.ts:60-75`); the dashboard keys the same without root
  (`server/lib/releases.ts:47-55`). "In-flight dropped only if still the current one" is backlog-manager's (`:163-166`).
- D7: both Nest apps test with Jest + ts-jest (`guide-manager/jest.config.ts`, `backlog-manager/package.json:17`); all three apps are on `react ^18.3.1`.
- D13: breakpoints 639/640 (`guide Drawer.tsx:6`, `styles.css:85`), 700 (`useNarrow.ts:22`), 768 (`dashboard styles.css:3163`). All three drawers are 400 px.
- D14: `renderMarkdown(source): string` (`markdown.ts:179`) and guide-manager's `renderNotes(md): string` (`lib/releases.ts:109`); both hosts set the string with
  `dangerouslySetInnerHTML` (`backlog ReleasesDrawer.tsx:38`, `guide ReleasesDrawer.tsx:37`). The dashboard's `<Markdown text>` is a component (`Markdown.tsx:85`).
- D15/D16: guide-manager's Drawer focuses the panel on open, restores through `restoreTarget` (☰ fallback) on close, and listens on `document`
  (`ui/Drawer.tsx:13-44`); backlog-manager's calls `useDialogEscape` + `useNarrow` and moves no focus (`ui/Drawer.tsx:19-22`); the dashboard's has the ✕ in
  `.rel-head` with `autoFocus`, a `window` keydown listener and `useBackClose`, and a baseline without a date (`ReleasesDrawer.tsx:10-12, 36-55`). Aria-labels:
  guide-manager `What's new — ${label}` / `, new release` (`SideRail.tsx:134`); dashboard `Running ${label}, new releases — open What's new` (`SideRail.tsx:332`).
- D17 keys: `dashboard.releases.lastSeen` (`:10`), `backlog-manager.releases-last-seen` (`:11`), `guide-manager.releases-last-seen` (`:13`).
- Part 0: the literal pin and the "floating ref" comment (`test/server-deps.test.ts:18-21`); the regex's six cases compute as stated; neither other app's `test/`
  mentions `release-kit#v`. Part 1: tags `v1.0.0 v1.0.1 v1.1.0`, so `feat` cuts `v1.2.0`; all five PR titles in the spec pass `checkTitle`
  (`conventional.ts:4-5`; `chore`, `refactor`, `test` are SILENT, `feat` RELEASING).
- Bump workflow premises: `self.yml` `release` is `if: github.event_name == 'push'` with `kit-ref: ${{ github.ref_name }}` and the concurrency group has
  `cancel-in-progress: true` (`self.yml:14-16, 29-36`); `release.yml` checks the kit out into `.release-kit` (`:35-39`); `pr-title.mjs` is a Node script
  importing committed `dist/`; the YAML guard pattern is `test/workflows.test.mjs`. Ruleset requires 0 approvals (`rulesets/main.json:15`).
- Part 2: README's checklist asks only that the contexts have reported before the ruleset is applied (`README.md:56-62`); `apply-repo-settings.sh <owner/repo>
  [--dry-run]`; baseline tag + "re-running the workflow" creates its Release (§Adopting releases step 3).
- Part 3: `useBackClose(onClose)`, `useDialogEscape(onClose)`, `useNarrow(): boolean`, `overrideReleasesRoot`/`releasesReadCount` with tests counting 1 and 2
  reads (`dashboard test/api-releases.test.ts:133, 185, 195`), Playwright `*-releases.png` baselines, `docs/subsystems/releases.md:62` "sixth dialog", DESIGN.md
  §8.7 "Drawer", the parity test (`test/api-releases.test.ts:204-207`), guide-manager's `docker:sync` removing `guide-manager_guide-manager-node-modules`
  (`package.json:21`) and backlog-manager's not (`package.json:25`), guide-manager `CLAUDE.md:180-185` stating the race and the memo rule.
- Testing: `makeRepo` configures identity per repo (`test/fixtures/repo.ts:25-26`); guide-manager's suite has the seven `dotState` cases, the three
  `displayTitle` inputs, `compareVersions('0.10.0','0.9.0') > 0`, `v0.2.0`/`v0.2.0+3` (`test/releases-lib.test.ts:16-69`); `isReleasesResponse` requires
  `typeof c.ahead === 'number'` (`hooks/useReleases.ts:51`).
- Hard rules: backlog-manager's "every git read is `runGit`, async, bounded at 10 s" (`CLAUDE.md:147`) is kept by routing every reader launch, the memo key's
  `rev-parse` included, through the port; `test/git-run.test.ts` greps `server/src` for synchronous spawns only, which `node_modules` is outside of. The
  dashboard's "Keep new deps out of `server/`" (`.claude/CLAUDE.md:73-81`) is untouched — ui-kit is a client dependency. guide-manager's "Sanitisation happens
  where the HTML executes" (`CLAUDE.md:164`) is kept by Part 3 item 1.

## Critical

**[C] L68 (D6) and L208–L209 — the `typesVersions` entry Part 1 adds breaks the shim both Nest apps keep until Part 3, so the "no-op" bump PR fails typecheck in
two of three apps.** Both shims are `declare module 'release-kit' { export * from 'release-kit/dist/esm/index'; }` under `moduleResolution: "node"`
(`backlog-manager/server/src/releases/release-kit.d.ts:10-12`, `guide-manager/server/src/releases/release-kit.d.ts`, both `tsconfig.json:6`). The bare
`release-kit` import is indeed served by the ambient declaration, but the shim's own subpath `release-kit/dist/esm/index` goes through `typesVersions`, and the
natural catch-all `{"*": {"*": ["dist/esm/*"]}}` rewrites it to `dist/esm/dist/esm/index` with no fallback. Measured with tsc 5.9.3 over a scratch
`node_modules/release-kit` holding today's `dist/`: (A) today's package.json + shim → OK; (B) catch-all `typesVersions` + shim → `TS2305: Module '"release-kit"'
has no exported member 'parseTagMessage'` / `'readReleases'`; (C) catch-all, no shim → OK; (D) no `typesVersions`, no shim → `TS2307` (today's reason for the
shim); (E) narrow `{"*": {"index": ["dist/esm/index.d.ts"]}}` + shim → OK; (F) narrow, no shim → OK. So with the obvious mapping the `chore(deps): bump release-kit
to v1.2.0` PR that L208 says "merges first — a no-op for the app" is red in backlog-manager and guide-manager (their `nest build`/`tsc` runs under
`check-commands`), and Part 3's ordering cannot be followed. → In D6, pin the shape: `"typesVersions": { "*": { "index": ["dist/esm/index.d.ts"] } }` (or the
catch-all plus a passthrough `"dist/*": ["dist/*"]`), state why (the two shims import `release-kit/dist/esm/index` until Part 3 deletes them), and add a Part 1
test case: under `moduleResolution: node`, both the bare import and `release-kit/dist/esm/index` resolve. Apply the same shape to ui-kit for symmetry.

## Important

**[I] L118–L119 — the bump workflow's version needs the calling repo checked out with its tags, and the spec does not say so.** `actions/checkout` defaults to
depth 1 and fetches no tags; `release.yml:31-34` uses `fetch-depth: 0` with a comment for exactly this reason. Without it the workflow sees no `vX.Y.Z` tag,
takes the "no version → ends green with a warning" branch on every push, and no bump PR is ever opened — a silent, green failure that the YAML guard tests
(L286–L290) cannot catch. → Add to the version bullet: "the calling repo is checked out with `fetch-depth: 0` (as `release.yml` does), after `release` has pushed
the tag"; and add a guard test that the workflow's first checkout has `fetch-depth: 0`.

**[I] L229 vs L216 — guide-manager's `renderNotes` "stays the escape-first renderer + `sanitizeSnapshot`", but every migration PR "deletes the client lib", which
is where that renderer lives.** `renderNotes` is `guide-manager/client/src/lib/releases.ts:109-135` and ends with `sanitizeSnapshot`; after the deletion there is
no local renderer to "stay". The implementer must guess between keeping the lib (contradicting L216) and composing ui-kit's `renderNotesHtml`. → Write it as
the composition: `renderNotes={(notes) => <div dangerouslySetInnerHTML={{ __html: sanitizeSnapshot(renderNotesHtml(notes)) }} />}`, and note that
`sanitizeSnapshot`'s `handleAnchor` sets `rel="noopener"` (`lib/sanitize.ts:226` region; the suite asserts it, `test/releases-lib.test.ts:116`), so in
guide-manager the link `rel` stays `noopener`, not ui-kit's `noopener noreferrer` — intended, but say it.

**[I] L157–L162 — the setup order dispatches the release workflow (step 4) before `BUMP_TOKEN` exists (step 5), and the spec itself says a missing token fails
the job.** ui-kit's `release.yml` follows README's app shape, which has `workflow_dispatch` (`README.md:66-84`), so its `bump` job (`needs: release`) runs on
the baseline dispatch; with no secret it fails per L143, leaving the baseline run red. The spec also never says which ui-kit workflow file carries the `bump` job
— in release-kit it is `self.yml`, where `release` lives; in ui-kit `release` lives in `release.yml`, not `ci.yml`. → Swap steps 4 and 5, and in D8 or Part 2
say "in ui-kit the `bump` job is in `release.yml`, after `release`; it also runs on a dispatch there, harmlessly".

**[I] L259 — the fake-`git` timeout case will not "resolve within roughly `timeoutMs`" unless the fake kills its own `sleep`.** `execFile` settles when the
child's stdio pipes close, not when the child exits; `timeout` sends SIGTERM to the shell script, whose backgrounded or foreground `sleep` survives it and holds
stdout open for the full sleep. backlog-manager hit exactly this and documents the fix — the script traps TERM and kills its `sleep`
(`backlog-manager/test/git-run.test.ts:27-30, 35-43`). An implementer who writes the obvious `sleep 30` fake will see the call take 30 s and may conclude the
`execFile` timeout does not work. → Add to the case: "the fake traps TERM and kills its sleep (see backlog-manager's `test/git-run.test.ts`), or redirects its
stdout, so the pipes close with the process".

**[I] L137 — step 4 (close older `bump/<package>-*` PRs) runs only on the "Otherwise, update it" path, so a run cancelled between 3.4 and 4 leaves the superseded
PR open forever.** Every re-run then ends at step 2's "an open PR from `bump/<package>-<version>` exists → done, green" and never reaches step 4, contradicting
L138's "a re-run only opens what is missing" as the idempotence rule (closing what is superseded is part of the desired end state). `self.yml`'s
`cancel-in-progress: true` (L129) makes the window routine. → Make step 4 unconditional: "on every path, close every open `bump/<package>-*` PR whose version is
below the newest, with the superseded comment", and add the script case "already pinned, an older bump PR still open → closed".

## Minor

- L244: the dashboard's `narrow` is given as `(max-width: 767px)`, but the app already has `useNarrow()` with `NARROW_PX = 767.98`, documented as a deliberate
  true complement of the CSS `min-width:768px` with no gap at fractional widths (`client/src/hooks/useNarrow.ts:13-28`), and that file exists to prevent a second
  literal. → "`narrow` is its existing `useNarrow()`".
- L65: "deletes its 168-line copy" — `releasesRoot()`, `findRepoRoot` and the `@Injectable` class with the route stay as the thin mount (`releases.service.ts:52-69,
  143-167`); L215 already says "replaces the server service's body". Align L65 with L215.
- L307 vs L331: "ported case for case" — the "quote in a URL cannot leave the `href`" case is not in guide-manager's suite (`test/releases-lib.test.ts:95-135`);
  say "plus one new case".
- L227: `restoreTarget` lives in the drawer shell the same PR deletes (`guide-manager/client/src/components/ui/Drawer.tsx:13-18`); say it moves into the wrapper.
- L133: `corepack enable` followed by `pnpm` needs `COREPACK_ENABLE_DOWNLOAD_PROMPT: '0'` on the step, as `ci-node.yml:51, 66, 141` sets; without it pnpm's first
  download may prompt.
- L139: "There is no `workflow_dispatch` path" is true for `self.yml` only; ui-kit's `release.yml` has one (see the Important above), so the sentence should be
  scoped to release-kit.
- L167: `./styles.css` is an export, so wherever the file lives must be inside `files` (release-kit's is `["dist"]`, `package.json:21-23`) or a `github:` install
  drops it; one clause for the builder.
- L330 vs L307: the ported https-link case asserts `rel="noopener"` in guide-manager (`test/releases-lib.test.ts:116`); ui-kit's asserts `noopener noreferrer` by
  D14 — say the ported case changes its expectation.
- L281: `makeRepo` has no worktree helper (`test/fixtures/repo.ts:6-13`); the case runs `git worktree add` itself. Fine, but "from release-kit's existing
  `makeRepo`" (L252) overstates what the fixture provides for that case.
- L186: guide-manager draws the dot after the label (`SideRail.tsx:141-142`), the dashboard before it (`SideRail.tsx:335-336`); the spec's `uk-chip-dot` leaves
  the order to the builder, which is fine, but the dashboard's Playwright re-shoot (L248) will show it.
