## Goal

claude-agents-dashboard's releases read uses release-kit's memoised reader, while `overrideReleasesRoot` and `releasesReadCount` survive as a thin test layer.
Spec D4 and Part 3.

Requires: release-kit `v1.2.0` and ui-kit `v0.2.0` are released, and this repo's `chore(deps): bump release-kit to v1.2.0` PR is merged into `main`.

Source: plan Phase G in futin/release-kit `docs/superpowers/plans/2026-10-18-shared-releases-ui.md`,
spec `docs/superpowers/specs/2026-10-18-shared-releases-ui-design.md`
Part 3 (local checkout `/Users/andrejajevtic/Documents/custom-projects/release-kit`). The plan gives behaviour and test cases, never literal code; where the
code disagrees with this item, follow the code and say so in your report.

## Plan

1. `server/lib/releases.ts`: a module-level reader from `createReleasesReader({ root: () => rootOverride ?? repoRoot(), git: countingPort })`, where
   `countingPort` wraps release-kit's exported `defaultGitPort()` and counts `for-each-ref` launches. Import from the bare `release-kit` specifier only.
2. `overrideReleasesRoot` recreates the reader and resets the count; `releasesReadCount` returns it.
3. Commit `refactor(releases): use release-kit's reader`.

## Test cases

- `test/api-releases.test.ts` passes unchanged.
- `test/server-deps.test.ts` stays green (exact pin).

## Done when

- `pnpm test` passes.
- `pnpm typecheck` passes.
