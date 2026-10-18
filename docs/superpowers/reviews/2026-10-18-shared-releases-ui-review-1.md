# Review 1 — implementation plan `2026-10-18-shared-releases-ui.md` against spec `2026-10-18-shared-releases-ui-design.md`

Reviewed 2026-10-18 by a fresh Fable 5.1 subagent with only the two documents, the four repos (release-kit, guide-manager, backlog-manager,
claude-agents-dashboard; ui-kit does not exist yet) and the fixed checklist. Every claim about code below was checked by reading it; `file:line` cites
the repo in question (paths relative to that repo's root). `plan:N` / `spec:N` cite the two documents.

## Verdict

**APPROVE WITH FIXES.** The plan covers every spec section and every spec test case (coverage table below), the values and copy strings match the spec,
the task order is sound and the Review Focus items each have a test. One Critical and nine Important findings, all local edits — none changes the
architecture.

## Checklist results

1. **Coverage** — complete. Mapping (spec → task): Part 0 → A1; D2/D3/D5 server API → B1; D4 → B2; D6 → B3 (+ E1/F1 shims); bump script cases
   (spec:300-308, nine of them) → B4 (all nine present, plus five more); bump workflow + `self.yml` (spec:108-154) → B5; README → B6; Part 2 Setup → C1;
   D19 consumer listing → C2; wire types + D19 type test → D1; pure logic (spec:175-180, 312-342) → D2/D3; hooks (spec:181-188, 365-372) → D4; D15
   Drawer (spec:354-361) → D5; chip/panel/drawer/useMediaQuery (spec:189-196, 344-363) → D6; D13 tokens → D7; D18 playground → D8; packaging
   (spec:377-380) → C1/D9; Part 3 per-app → E/F/G. Spec `readReleasesResult` cases (spec:264-273) and `createReleasesReader` cases (spec:280-289):
   every one has a B1/B2 case. Gaps are Minor only (M4, M11).
2. **Values** — every title, branch, secret, warning string, aria-label, label, key and timeout checked against the spec: all match. One count is wrong
   (I2).
3. **Reality** — every Modify path exists; every Create path does not. Facts that are false: I1 (tsc 7 and node10), I9 (a test the plan says is gained
   already exists), I10 (suites "pass unchanged" import a symbol the plan deletes).
4. **Interfaces** — B2/B5/D4–D6/E–G consume only names earlier tasks produce, except G1's counting port, which needs `defaultGitPort` that B1 exports
   from `git.ts` only (I4).
5. **Order** — no task depends on a later one; the gates (Phase A before B merges, `v1` moved before C/D, bump PRs merged before E–G) are stated.
6. **Tests** — each task's cases fail before implementation (B1's same-second case only fails because the `git` option does not exist yet; it is a
   regression guard, acceptable). Review Focus 1–5 each have their test in the named task. Behaviour, not implementation, throughout, with D5's
   "`addEventListener` not called with `keydown`" taken from the spec itself. Two pass/fail claims are false as written (I1, I5-adjacent: I2).
7. **Conventions** — "behaviour not literal code" held throughout; soft sizes stated; 160-column wrap held.

## Critical

### C1 — Task B3's node10 fixture cannot be compiled by release-kit's own TypeScript (plan:139-145)

The test runs `tsc --noEmit -p` on a fixture whose `tsconfig.json` sets `moduleResolution: "node"`. release-kit's compiler is `typescript` `7.0.2`
(`package.json:26`, `package-lock.json` `node_modules/typescript` `7.0.2`). Verified with the same version (lookout-widgets' `node_modules/typescript`
7.0.2) on a one-file fixture: `error TS5108: Option 'moduleResolution=node10' has been removed. Please remove it from your configuration.` TypeScript
6.0.3 gives `TS5107 … is deprecated and will stop functioning in TypeScript 7.0`; 5.9.3 compiles clean. So the test is red forever and `npm test`
(the `ci / checks` gate, `self.yml:21-23`) stays red for Phase B. The spec itself measured D6 "with tsc 5.9.3" (spec:68) — the Nest apps' compiler
(`guide-manager/tsconfig.json:6` `moduleResolution: "node"`).

**Fix:** add a devDependency alias pinned to the apps' compiler, e.g. `"typescript-5": "npm:typescript@5.9.3"`, and have the test spawn
`node_modules/typescript-5/bin/tsc -p <fixture>`; state in B3 that the fixture must never be compiled by the root `tsc`. (Equivalently: the test
installs nothing and skips when the alias is absent, the `yamlSkip` pattern — but then CI must not skip, as `test/yaml-gate.mjs` already arranges.)

## Important

### I1 — "Run `npm test` — pass" in B1–B5 and D2–D8 is false while `dist/` is stale (plan:107, 135, 145, 174, 194; plan:268, 278, 290, 301, 316, 327)

`test/dist-drift.test.ts:17-31` rebuilds `src/` into a tmp dir and fails on any byte difference from the committed `dist/`. Every task in Phase B edits
`src/` and only B6 runs `npm run build` (plan:203); every Phase D task edits `src/` and only D9 builds (plan:340). So each "Step 4: Run `npm test` —
pass" is red on the drift case, and an implementer must guess whether to build, to run one file, or to ignore the red.

**Fix:** in every task that touches `src/`, make Step 4 "`npm run build`, then `npm test` and `npm run typecheck` — pass" and commit `dist/` with the
task (Global Constraints plan:27 already says dist is committed); or scope Steps 2 and 4 to `node --import tsx --test test/<file>` and leave the full
suite to B6/D9 — but say which.

### I2 — "four reads" lists three (plan:92-93)

`readReleasesResult` launches `for-each-ref`, `remote get-url origin` and `describe --long …` (`src/read-releases.ts:27, 37, 46`); the memo key's
`rev-parse` belongs to B2's reader, not to B1's function. The recording-port case says "four reads" and then names three. **Fix:** "three reads".

### I3 — the bump PR body cannot link "each version skipped over" (plan:165-166, 173 vs spec:137)

Spec step 3.4: the body "links the package's GitHub Release for each version skipped over". Plan B4 has the body carry one link
(`…/releases/tag/v0.3.0`) and states that version discovery stays out of the script, which receives only `VERSION` (plan:154-155, 173) — so it cannot
know what was skipped. **Fix:** either the version job also outputs the ordered tag list and the script takes `VERSIONS` (newline-separated, newest
first) and links every tag above the consumer's current pin; or amend the body to link the newest tag plus the package's `/releases` page and record
the deviation from spec:137 in the plan.

### I4 — G1's counting port needs `defaultGitPort`, which only `git.ts` exports (plan:88 vs plan:388-389)

B1: "`defaultGitPort(timeoutMs): GitPort` (internal; exported from `git.ts` only)". G1: `countingPort` "wraps release-kit's default behaviour". The
dashboard's server may import exactly the bare specifier `release-kit` and nothing else — `test/server-deps.test.ts:22-25, 72-80` collects every bare
specifier under `server/` and requires the set to equal `['lookout-widgets', 'release-kit']`, so `release-kit/dist/esm/git.js` is an offender. The
spec's export list (spec:99-101) has no default port either. **Fix:** B1 exports `defaultGitPort` from `src/index.ts` and lists it in Produces (one
line; keeps D3's "the port is the reader's only" since the release engine still calls `git()`); or G1 builds its counting port on its own `execFile`
with `timeout` (what `server/lib/releases.ts:27-31` does today, minus the timeout). The first is less code in the app.

### I5 — the `secrets.token` guard forbids the checkout shape the spec describes (plan:190 vs spec:122)

Spec step 1: "Check out the consumer's default branch with the token." With `actions/checkout@v5` that token goes under `with: token:`
(cf. `.github/workflows/release.yml:36-39` for the `with:` shape). B5's guard: "`secrets.token` appears only under `env:` of steps running `git`/`gh`/the
script" — the guard rejects `with.token`. An implementer must pick: clone in a `run:` step with the token in `env:` (then `actions/checkout` is not used
for the consumer at all), or widen the guard to allow `with.token` on `actions/checkout` steps. **Fix:** state which; the first keeps the spec's
"used only by `git` and `gh`" (spec:144-145) literally true.

### I6 — the `mixed` fixture's order and `current` are unstated, and D4's cases depend on them (plan:248 vs plan:285-286)

D1 lists `mixed` ascending (`0.1.0`, `0.2.0`, `0.2.1`, `0.3.0`) and gives no `current`. D4 expects `chip { label: 'v0.3.0', dot: false }` on `mixed`
and `dot: true` with storage `0.2.1` — both need `releases[0].version === '0.3.0'` (newest = `releases[0]`, as every app computes it,
`guide-manager/client/src/App.tsx:112`) and `current.version === '0.3.0'`. Written ascending, the hook reads `0.1.0` as newest and the chip says
`v0.3.0` only if `current` happens to be set. **Fix:** D1 states `mixed` is newest-first (`0.3.0`, `0.2.1`, `0.2.0`, `0.1.0`), the API's order, with
`current: { version: '0.3.0', ahead: 0 }`; and `noCurrent` = `mixed` with `current: null`.

### I7 — F2 "App/SideRail as E2" gives backlog-manager the wrong chip class (plan:379 vs plan:363)

E2 names `className="rail-version"` (guide-manager's class, `client/src/components/SideRail.tsx:133`). backlog-manager's chip is `rail-release`
(`client/src/components/SideRail.tsx:218`, styles `client/src/styles.css:244-252`); it has no `.rail-version` rule, so "as E2" would drop the chip's
placement. **Fix:** F2 says `className="rail-release"`.

### I8 — `test/dialog-escape.test.tsx` does not "gain" the drawer-over-modal case; it has it (plan:379-380)

`backlog-manager/test/dialog-escape.test.tsx:327`: "closes the What's new drawer over an open item modal, and leaves the modal for the next press".
**Fix:** "keeps … green" — the point of the case under the migration is that `closeOnEscape={false}` + `useDialogEscape` preserves it.

### I9 — E1/F1 delete `findRepoRoot` from the services while suites that must "pass unchanged" import it from them (plan:357, 375)

`guide-manager/test/releases.e2e.test.ts:11` and `backlog-manager/test/api-releases.test.ts:13` import `findRepoRoot` from
`server/src/releases/releases.service`. E1 says `test/releases.e2e.test.ts` "must pass unchanged" and F1 says "keep its route cases" while both say
`findRepoRoot` now comes from release-kit. **Fix:** "the service re-exports release-kit's `findRepoRoot`" (one line), or name the import edit in the test.

## Minor

- M1 plan:127 — "fresh repo with no `packed-refs`" needs one commit: on an empty repo `rev-parse HEAD` fails and the key is `null` (not memoised, by
  design), so the case as named tests the wrong branch. Say "one commit, no tags, no `packed-refs`".
- M2 plan:186-187 — the `version` job runs release-kit code, so it needs the `.release-kit` checkout too; the plan only states it for the matrix job.
- M3 plan:183-193 — `test/workflows.test.mjs:39-43` ("no job sets name:") and the `setup-node` cache guard (`:107-113`) loop over a fixed file list;
  add `bump-consumers.yml` to both.
- M4 plan:265 — spec:313 says "case for case" from `guide-manager/test/releases-lib.test.ts`; its "round-trips a raw version string under its key"
  (`:77`) is missing from D2.
- M5 plan:288 — React 18 no longer warns on a state update after unmount, so "no state update warning" cannot fail. Pin it as "no `setData` after
  unmount" through a stubbed `fetch` that resolves after `unmount()` and a spy, or drop the case.
- M6 plan:310 — the chip's own class `uk-chip` (spec:190) is not named in D6's cases; only `.uk-chip-dot` is.
- M7 plan:340 — "no `react` code in `dist/`" is vague for a `tsc` build; say "every `react` reference in `dist/` is an import/require of `react` or
  `react/jsx-runtime`, never an inlined copy".
- M8 plan:366, 382, 395 — dead chip-dot rules not listed for deletion: `.rail-version-dot`/`.rail-version-label` (guide-manager `client/src/styles.css`),
  `.rail-release-dot` (backlog-manager `client/src/styles.css:252`), `.rel-dot` (dashboard `client/src/styles.css`). `VersionChip` renders `uk-chip-dot`.
- M9 plan:382 — `backlog-manager/test/daylight-contrast.test.ts` has no release-badge rows today (grep `releases|badge`: none), so "reads the badge
  pairs from the mapping" is an addition; say "adds".
- M10 plan:386-397 — spec:209-210 retitles the migration PR `fix` when the look changes visibly; D16 (spec:78) says the dashboard's look changes by
  design (✕ moves, baseline gains its date). Say so in Phase G or record the author's call.
- M11 plan:161-162 — spec:138 closes superseded PRs "on every path"; B4 tests it only on the `opened` and `pinned` paths. One case on `open` or
  `closed` would pin the "unconditional" half.
- M12 plan:100 / spec:100 — `writeReleasesJson` "bounded by the default timeout" has no case; the existing equality case
  (`test/read-releases.test.ts:148`) does not exercise the bound. Acceptable to leave; noting the gap.
- M13 plan:394 — the D17 case added to the dashboard tests ui-kit's `useWhatsNew` (already D4 / Review Focus 3). Fine as app-level proof of the fix
  landing; say it is deliberate so nobody deletes it as a duplicate.
