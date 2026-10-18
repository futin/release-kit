# Review 1 — Shared releases UI design spec

Document: `docs/superpowers/specs/2026-10-18-shared-releases-ui-design.md` (381 lines). Reviewer: Fable 5.1, 2026-10-18. Read-only; the document was not edited.
Code checked in release-kit (`src/git.ts`, `src/read-releases.ts`, `src/release.ts`, `src/index.ts`, `package.json`, `.github/workflows/*.yml`, `rulesets/main.json`,
`test/workflows.test.mjs`, `test/fixtures/repo.ts`, README), guide-manager (`client/src/lib/releases.ts`, `components/ReleasesDrawer.tsx`, `components/ui/Drawer.tsx`,
`hooks/useReleases.ts`, `App.tsx`, `components/SideRail.tsx`, `server/src/releases/*`, `test/releases-lib.test.ts`, CLAUDE.md), backlog-manager (`server/src/git-run.util.ts`,
`server/src/releases/*`, `client/src/hooks/useNarrow.ts`, `useDialogEscape.ts`, `lib/markdown.ts`, `components/ui/Drawer.tsx`, `App.tsx`, `test/api-releases.test.ts`,
`docs/subsystems/releases.md`, CLAUDE.md) and claude-agents-dashboard (`test/server-deps.test.ts`, `client/src/lib/releases.ts`, `hooks/useReleases.ts`, `hooks/useBackClose.ts`,
`components/ReleasesDrawer.tsx`, `App.tsx`, `server/lib/releases.ts`, `client/src/styles.css`, `.claude/CLAUDE.md`, `.claude/DESIGN.md`). Repo visibility checked with `gh repo view`.

## Verdict

**REVISE** — one Critical (the bump workflow's branch/PR idempotence has a hole that turns a cancelled run or a declined PR into a permanently red consumer job or a
re-opened PR on every push), six Important. All fixes are a sentence or two each; nothing structural is wrong.

## What checked out (so the author need not re-verify)

- Intent §: dashboard `markSeen` writes unconditionally (`client/src/lib/releases.ts:86-93`) — the "below the stored one" bug is real. backlog-manager's
  `releases.service.ts` is 168 lines and re-runs `for-each-ref`/`describe`/`remote` through `runGit`. guide-manager races `readReleases` against a 10 s timer
  (`releases.service.ts` `boundedRead`); release-kit's `git()` has no `timeout` (`src/git.ts:15`).
- D3: `runGit(args, { cwd?, maxBuffer? }) => Promise<string | null>` (`git-run.util.ts`), `__setGitTimeoutMs` exists, `maxBuffer` defaults to execFile's 1 MiB,
  backlog-manager's figure is `32 * 1024 * 1024` (`releases.service.ts` `MAX_BUFFER`). `runGit`'s optional `cwd` is assignable to the port type.
- D5 matches backlog-manager's `Computed`/`complete` semantics line for line. D6: both apps are `moduleResolution: "node"` and carry the identical ambient shim;
  an ambient `declare module` wins over a resolved file in TS, so the v1.2.0 bump PR stays a no-op before the shim is deleted.
- D13: breakpoints 640 (`guide-manager/client/src/styles.css`, `(max-width: 639px)`), 700 (`useNarrow.ts` `NARROW_QUERY`), 768 (dashboard `styles.css:3162`
  `@media (min-width:768px)` makes `.rel-drawer` 400 px). All three drawers are 400 px.
- D16: guide-manager's markup is as described (✕ in the panel corner via `ui-drawer-close`, `What's new` + `running {chipLabel}`, badge/Breaking/date/title/notes/`PR #N`,
  baseline divider with date). The dashboard's ✕ is in `.rel-head` and its baseline has no date. The aria-label `What's new — v…, new release` is guide-manager's
  (`SideRail.tsx:134`).
- D17: keys are `dashboard.releases.lastSeen`, `backlog-manager.releases-last-seen`, `guide-manager.releases-last-seen`.
- Part 0: `test/server-deps.test.ts` pins the literal `github:futin/release-kit#v1.1.0` with the "floating ref" comment; neither other app has such a test. The regex's
  cases compute correctly. Part 1: tags are `v1.0.0 v1.0.1 v1.1.0`, so `feat` cuts `v1.2.0`; ui-kit `v0.1.0` + `feat` → `v0.2.0`.
- Part 3: `useBackClose(onClose)`, `useDialogEscape(onClose)`, `useNarrow(): boolean`, `overrideReleasesRoot`, `releasesReadCount`, the Playwright `*-releases.png`
  baselines, `docs/subsystems/releases.md:62` ("sixth dialog on the Escape stack"), DESIGN.md §8.7, the parity test (`test/api-releases.test.ts:204`), guide-manager's
  `docker:sync` dropping the named volume and backlog-manager's not — all as stated. guide-manager's `test/releases-lib.test.ts` has exactly the seven `dotState`
  cases and the three `displayTitle` inputs the spec lists.
- Ruleset `main.json` requires 0 approvals, so PRs opened by the PAT owner are mergeable by the same person. All four repos are public, so `pnpm install
  --lockfile-only` can resolve the `github:` tarball without credentials.
- `${{ }}`/env rule and the YAML guard pattern (`test/workflows.test.mjs`) exist as described; `chore(deps): …` passes the title rule (lowercase scope).

## Critical

**[C] L124, L131–L133 — a bump branch that exists without an open PR is unspecified, and the two ways it arises are routine.** Step 2 ends green only on "already pinned"
or "an open PR from `bump/<package>-<version>` exists". Two realistic states fall through: (a) `self.yml` has `cancel-in-progress: true` (`.github/workflows/self.yml:15-17`),
so two merges in quick succession cancel a run between step 3.3 (branch pushed) and 3.4 (PR opened); (b) a human closes a bump PR without merging to decline it. In
both, the next run (which is every push to `main`, L132) reaches step 3.3 with the branch already on the remote. A plain `git push` of a fresh commit is rejected
(non-fast-forward) → that consumer's matrix job is red on every push to the package's `main`, the outcome L122 calls unacceptable. A builder who "fixes" it with
`--force` instead re-opens a declined PR on every push. → Specify: the branch content is deterministic, so push with `--force-with-lease`/`--force`; and treat a
*closed, unmerged* PR for `bump/<package>-<version>` as "declined": end green with a notice, no new PR, until the next version. State both in the idempotence
paragraph and add both cases to the script's unit tests (L285–L290).

## Important

**[I] L133 vs L137 — the caller's `bump` job cannot be both `needs: release`, push-only, and runnable from `workflow_dispatch`.** `self.yml`'s `release` job is
`if: github.event_name == 'push'` (`self.yml:28`), so on a dispatch it is skipped and a dependant with `needs: release` is skipped too, unless it carries
`if: !cancelled()` and tolerates a skipped `release`. `self.yml` also has no `workflow_dispatch` trigger today. → Pick one: either drop "plus `workflow_dispatch`"
from L133, or say `self.yml` gains `on: workflow_dispatch` and `bump` runs `if: ${{ !cancelled() && needs.release.result != 'failure' }}`.

**[I] L114, L137 — what `kit-ref` selects is never said, and the first run depends on it.** The bump script lives under release-kit's `scripts/` (L283), so the reusable
workflow must check release-kit out at some ref to run it, as `ci-node.yml`'s `pr-title` job does with `path: .release-kit`. On Part 1's own merge, `v1` still points at
`v1.1.0`, which has no script; `self.yml` must pass `kit-ref: ${{ github.ref_name }}` as its other two jobs do (`self.yml:26,36`). → Define `kit-ref` as "the release-kit
ref the bump script is taken from" and state that `self.yml` passes `github.ref_name`, while ui-kit's caller uses the default `v1` (which is why L93 moves `v1` first).

**[I] L66 — the memo key's two `stat`s have no stated behaviour for a missing file, and "missing" is the normal state.** A fresh `git init` has no `packed-refs`; after
`git pack-refs --all` or `clone`, `refs/tags/` can be absent or empty. All three existing copies answer `0` for a missing path (`backlog-manager …/releases.service.ts`
`mtime()`, guide-manager idem, dashboard `server/lib/releases.ts` `mtime()`), but the spec only says "a key git cannot produce is never memoised" — a builder who
treats a failed `stat` the same way never memoises a fresh checkout. Also unsaid: `--git-common-dir` prints a path relative to the cwd for a main checkout
(`.git`), so it must be resolved against `root`. → Add: "a path that does not exist contributes a fixed sentinel (the copies use `0`); the common dir is resolved
against `root`; the stats are async."

**[I] L174 — "`show()` refreshes, then opens" reads as sequential; all three apps open at once and refresh in the background.** guide-manager `App.tsx:124-126`,
backlog-manager `App.tsx:189-190` and the dashboard `App.tsx:112-114` each call `refresh()` and set the open flag synchronously. A builder who awaits the refresh
delays the drawer by up to the server's 10 s bound on a slow git — the "slow git hanging a route" anti-goal (L54) moved into the UI. → "`show()` fires a refresh and opens
immediately; the drawer re-renders when the answer lands."

**[I] L243–L244 — the existing fixture does not pass `-c user.name=… -c user.email=…`.** `test/fixtures/repo.ts:26-27` sets `user.name`/`user.email` with `git config`
inside the tmp repo (and `GIT_CONFIG_GLOBAL=/dev/null` in `ENV`, line 15). Harmless, but the sentence states a fact about existing code that is false. → "as in
`test/fixtures/repo.ts` (`makeRepo`), which configures identity per repo".

**[I] L262–L273 — "counts reads with a recording port" is ambiguous once `rev-parse` also goes through the port (L66).** Two calls under one key produce two
`rev-parse` launches and one `for-each-ref`; "one read" is only true if a read is defined as the `for-each-ref` launch (plus its `describe`/`remote`). The dashboard's
`releasesReadCount` (L237) has the same question. → Define "read" once: "a read is one `for-each-ref` launch; `rev-parse` for the key is not counted".

## Minor

- L81: D19 is listed before D18.
- L103: "the three mounting shapes (Nest controller, raw `http`)" names two.
- L65: "deletes its 168-line copy" — the 168 lines are the whole Nest service, including `releasesRoot()`/`findRepoRoot` and the `@Injectable` wrapper that stays as the
  thin mount (L207); "replaces the body of" is accurate.
- L165, L167: guide-manager's function is `renderNotes` (the spec renames it `renderNotesHtml`, fine, but say so), and `isReleasesResponse` lives in
  `hooks/useReleases.ts`, not `lib/releases.ts`, so "function for function" from the lib is not literally where it comes from. `chipLabel` in guide-manager takes a
  non-null `current`; the dashboard's takes the nullable one — state which signature ui-kit uses.
- L178–L179 / D16: the dashboard's chip aria-label today is `Running v…, new releases — open What's new` (`SideRail.tsx:332`); adopting guide-manager's wording is a
  user-facing copy change in that app that D16 does not list beside the ✕ and the baseline date.
- L221, L229, L236 vs D14: `renderMarkdown(source): string` (`backlog-manager/client/src/lib/markdown.ts:179`) and guide-manager's `renderNotes` return HTML strings,
  while the prop is `(notes) => ReactNode`; say the host wraps the string in a `dangerouslySetInnerHTML` element (as both apps do today), or make the prop accept a string.
- D15 / L226–L232: backlog-manager's `Drawer` moves no focus today (`components/ui/Drawer.tsx`); ui-kit's defaults (focus to panel, restore on close) are a behaviour
  change there — not wrong, but unlisted. Say whether backlog-manager's wrapper keeps the default or passes `restoreFocus={false}`.
- L214 / Part 3 guide-manager: its `CLAUDE.md:181-186` states the 10 s race and "only an answer with releases in it is memoised"; both become false. Name it with the
  other docs to update, as the backlog-manager entry names `docs/subsystems/releases.md` and DESIGN.md.
- L184 vs L376: `useMediaQuery` is in the public surface, and the "left to the builder" rule ("ui-kit if two apps need it") is already decided by L220 and L235 — drop
  the open item or the export, not both.
- L250: "A port that hangs past `timeoutMs`" — the case is about the *default* port with a fake `git` on `PATH` that sleeps; a custom port cannot be killed by
  `timeoutMs` (D2 applies it to the default port only). Reword.
- L65: the default port today uses `maxBuffer: 256 MiB` (`src/git.ts:15`); passing 32 MiB through the port lowers the reader's ceiling. Fine, but say the default port
  honours `o.maxBuffer` rather than its own constant.
- D12 (L74): `gh pr comment` posts through the issue-comments API; on a fine-grained PAT GitHub documents that endpoint under "Issues" write as well as "Pull requests"
  write. Worth one check on the first real run; if the close-with-comment step 4 fails with 403, add Issues: read/write.
- L157: the adoption checklist (README §Adopting it in an app) orders "PR green → read the contexts → apply the ruleset"; it does not say the PR must *land* first. The
  spec's order is sensible; "as the checklist requires" overstates.
- L148: "the session never creates the repo or the secret" — good; also note step 4's baseline Release needs a `workflow_dispatch` re-run (README §Adopting releases 3).
