## Goal

guide-manager's `/api/releases` service delegates to release-kit's memoised reader instead of carrying its own git, memo key and timeout race. The route and
its always-200 contract, and the `GM_RELEASES_ROOT` seam, stay. Spec D4, D5, D6.

Requires: release-kit `v1.2.0` and ui-kit `v0.2.0` are released, and this repo's `chore(deps): bump release-kit to v1.2.0` PR is merged into `main`.

Source: plan Phase E1 in futin/release-kit `docs/superpowers/plans/2026-10-18-shared-releases-ui.md`,
spec `docs/superpowers/specs/2026-10-18-shared-releases-ui-design.md`
Part 3 (local checkout `/Users/andrejajevtic/Documents/custom-projects/release-kit`). The plan gives behaviour and test cases, never literal code; where the
code disagrees with this item, follow the code and say so in your report.

## Plan

1. `server/src/releases/releases.service.ts`: the body becomes a `createReleasesReader({ root: releasesRoot })` held by the service, with `read()` delegating.
   Delete its `git`, `mtime`, `memoKey`, `boundedRead`, `READ_TIMEOUT_MS`.
2. Keep `releasesRoot()`, now using release-kit's `findRepoRoot`, which the service re-exports so `test/releases.e2e.test.ts`'s import keeps working.
3. Try deleting `server/src/releases/release-kit.d.ts` (spec D6). Keep it if `pnpm typecheck` or `nest build` fails, and say which in your report.
4. Update `releases.service.ts`'s header: the 10 s race is gone (the reader is bounded), and a complete empty answer is now memoised (spec D5).
5. Commit `refactor(releases): use release-kit's reader`.

## Test cases

- `test/releases.e2e.test.ts` passes unchanged.
- Only if the e2e harness can count git launches: "tagless checkout: two requests, one `for-each-ref`". Otherwise skip it (release-kit covers it) and say so.

## Done when

- `pnpm test` passes.
- `pnpm typecheck` passes.
- `pnpm build:server` passes.
