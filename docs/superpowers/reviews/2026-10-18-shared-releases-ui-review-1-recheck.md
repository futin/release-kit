# Plan review 1 — re-check of the changes

Reviewed: only the added/changed lines of `docs/superpowers/plans/2026-10-18-shared-releases-ui.md` (diff `plan-review1.diff`, commits `a1a5986`
and `c588f0e`) against `docs/superpowers/specs/2026-10-18-shared-releases-ui-design.md` and the code in release-kit, guide-manager, backlog-manager
and claude-agents-dashboard. Line numbers are the plan's current ones. Model: Fable 5.1. Date: 2026-10-18.

## Verdict

**APPROVE WITH FIXES** — no Critical finding. Two Important findings, both about a test the plan asks for; the rest is wording.

## What was verified against the code (changed lines only)

| Plan line | Claim | Checked at | Result |
| --- | --- | --- | --- |
| 35–36 | a dist-drift test exists in release-kit | `release-kit/test/dist-drift.test.ts` | exists |
| 90–91 | the dashboard's server may import only the bare `release-kit` specifier | `claude-agents-dashboard/test/server-deps.test.ts:68-75` (`bareSpecifiers` collects the full specifier; offenders must be `[]`, `seen` must equal `ALLOWED`) | true — a subpath import such as `release-kit/dist/esm/git` would fail that test, so exporting `defaultGitPort` from the root is needed for Task G1 |
| 95 | "three reads": `for-each-ref`, `remote get-url`, `describe` | `release-kit/src/git.ts:39`, `src/read-releases.ts:28,37` | three, correct (was "four") |
| 142–144 | release-kit is on TypeScript 7; TS 7 rejects `moduleResolution: node` with TS5108 | `release-kit/package.json:29` (`"typescript": "7.0.2"`); ran `lookout-widgets/node_modules/typescript` (7.0.2) `tsc` against a `moduleResolution: node` tsconfig → `error TS5108: Option 'moduleResolution=node10' has been removed` | true |
| 143 | the Nest apps compile with 5.9.3 | `guide-manager/package.json:59`, `backlog-manager/package.json:61` (`^5.9.3`) | true |
| 254–256 | `mixed` fixture newest-first "as the route answers" | `release-kit/src/git.ts:39` (`--sort=-creatordate`), no re-sort in `read-releases.ts` | consistent |
| 366 | `test/releases.e2e.test.ts` imports `findRepoRoot` from the service | `guide-manager/test/releases.e2e.test.ts:11` | true |
| 376 | `.rail-version-dot` rule in guide-manager `styles.css` | `guide-manager/client/src/styles.css:261` | exists |
| 376 | `.rail-version-label` rule in guide-manager `styles.css` | grep over `guide-manager/client/src`, `shared/` — only the class use at `SideRail.tsx:140`, no CSS rule | **false** (Minor, below) |
| 383–384 | `test/api-releases.test.ts` imports `findRepoRoot` from the service | `backlog-manager/test/api-releases.test.ts:13` | true |
| 388–390 | `rail-release` is SideRail's existing chip class; dialog-escape test case name | `backlog-manager/client/src/components/SideRail.tsx:218`; `test/dialog-escape.test.tsx:327` ("closes the What's new drawer over an open item modal, and leaves the modal for the next press") | true (plan quotes the first clause) |
| 392 | `.ui-drawer-*`, `.releases-*`, `.rail-release-dot` rules exist | `backlog-manager/client/src/styles.css:3216,2717,252` | exist |
| 393 | `test/daylight-contrast.test.ts` exists | `backlog-manager/test/daylight-contrast.test.ts` | exists |
| 399–400 | spec D16's dashboard aria-label change | `claude-agents-dashboard/client/src/components/SideRail.tsx:332` (`Running ${label}…, new releases — open What's new`) | true |
| 402–404 | `rootOverride`, `repoRoot()`, `overrideReleasesRoot`, `releasesReadCount` in `server/lib/releases.ts` | `claude-agents-dashboard/server/lib/releases.ts:10,12,17,24` | exist |
| 407–409 | `test/releases-client.test.ts` exists | `claude-agents-dashboard/test/releases-client.test.ts` | exists |
| 410 | `.rel-dot`, `.rel-chip`, `rel-*` drawer rules; `pnpm test:visual` | `claude-agents-dashboard/client/src/styles.css:322,325,3137-3155`; `package.json:16` | exist |
| 195 | existing "no job sets `name:`" guard has a fixed file list | `release-kit/test/workflows.test.mjs:43` (`['ci-node.yml', 'release.yml', 'self.yml']`) | true; the setup-node cache guards (`:99-104`, `:132-134`) are per-file tests, not a shared list (Minor wording) |

Coverage of the spec lines the diff touches: Part 1 step 3.4 (release links per skipped version) → Task B4 line 171; step 4's unconditional
supersede → Task B4 line 177; the `fetch-depth: 0` version job → Task B5 line 192; D6 under TS 5.9.3 → Task B3; D16's visible dashboard change →
Phase G title line 400. Interfaces: `defaultGitPort` is Produced by B1 (line 90) and Consumed by G1 (line 403) with the same spelling; `VERSIONS` is
read by B4's CLI (line 160) and produced by B5's `version` job as `versions` (line 192) — see Important 2 for the untested seam between them.

## Findings

### Important

**I1 — plan:297 — the "late fetch after unmount" case spies on `setData`, an implementation detail the test cannot reach.**
`setData` is a `useState` setter inside `useReleases`; nothing outside the hook can spy on it without mocking React itself, and the plan's own
convention (lines 5–7) and checklist item 6 ask for behaviour, not internals. Suggested fix: pin an observable — "a `fetch` resolving after
`unmount()` → nothing written to storage and no `console.error` (spy on `console.error`), the test exits cleanly". In `useWhatsNew` an answer that
lands normally triggers `dotState`'s seed write, so "storage untouched after unmount" is exactly the behaviour a leaked update would break.

**I2 — plan:192–201 — Task B5's guard tests never pin that the matrix step hands the `version` job's outputs to the script.**
The diff adds a `versions` output (line 192) and a `VERSIONS` env input on the script (line 160), but no guard case asserts the step that runs
`bump-consumer.mjs` has `env:` `VERSION: ${{ needs.version.outputs.version }}` and `VERSIONS: ${{ needs.version.outputs.versions }}` (nor `PKG`,
`REPOSITORY`, `CONSUMER`, `GH_TOKEN`). If the builder forgets `VERSIONS`, spec Part 1 step 3.4's "link each version skipped over" silently disappears
in production while every unit test in B4 stays green. Suggested fix: add one guard case to Step 1 — "the step running the script sets exactly
`PKG`, `REPOSITORY`, `CONSUMER`, `VERSION`, `VERSIONS`, `GH_TOKEN` in `env:`, the last from `secrets.token`, `VERSION`/`VERSIONS` from
`needs.version.outputs.*`".

### Minor

- **plan:376** — `.rail-version-label` has no rule in `guide-manager/client/src/styles.css` (only `.rail-version`, `:hover`, `.rail-version-dot` at
  255–261); the class is used by `SideRail.tsx:140` and vanishes with the span. Drop it from the delete list or say "class use".
- **plan:195** — "joins the fixed file lists of the existing … `setup-node` cache guards": only the `name:` guard has a list
  (`workflows.test.mjs:43`); the two setup-node guards are per-file tests (`:99`, `:132`). Say "gains a setup-node cache guard of its own and joins
  the `name:` guard's list".
- **plan:171** — spec step 3.4 says "each version skipped over"; the plan reads that as every version above the pin including the target
  (`v0.3.0` and `v0.2.0` for a `v0.1.0` pin). Reasonable, but it is a reading — one clause saying "including the new version" would stop a builder
  from arguing the target is not "skipped".
- **plan:90** — `defaultGitPort` is now a root export, which spec Part 1 §Server API (spec:97–103) does not list. Either add it to the spec's export
  list or note in the plan that this is an addition the dashboard's import rule forces.
- **plan:399–400** — the Phase G PR cuts a dashboard release (`fix`), so its body needs a `## What's new` section describing the visible change
  (spec D10's rule for retitled PRs; `release.ts:118` tags whatever `extractWhatsNew` finds, empty included). Say so in the Phase G paragraph.
- **plan:147** — `node_modules/typescript-5/bin/tsc` is relative to the repo root; fine as `npm test` runs there, but say "resolved from the package
  root" so a builder running the single test file from elsewhere does not trip.

## Not findings (checked and fine)

- Task B3's `typescript-5` alias is the right workaround: TS 7.0.2 really emits TS5108 for `moduleResolution: node`, and both Nest apps are on
  `^5.9.3`, so the fixture compiles under the same compiler the consumers use.
- Task E1/F1's `findRepoRoot` re-exports are both needed: each app's test imports the function from the service module.
- Phase G's `fix(releases)` title follows spec Part 3's retitle rule; the dashboard's chip aria-label does change (`SideRail.tsx:332`).
- The plan's convention (behaviour and cases, never literal code) holds on every changed line.
