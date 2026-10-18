## Goal

backlog-manager's `/api/releases` service delegates to release-kit's memoised reader, keeping every git launch on `runGit`. Spec D3, D4, D6.

Requires: release-kit `v1.2.0` and ui-kit `v0.2.0` are released, and this repo's `chore(deps): bump release-kit to v1.2.0` PR is merged into `main`.

Source: plan Phase F1 in futin/release-kit `docs/superpowers/plans/2026-10-18-shared-releases-ui.md`,
spec `docs/superpowers/specs/2026-10-18-shared-releases-ui-design.md`
Part 3 (local checkout `/Users/andrejajevtic/Documents/custom-projects/release-kit`). The plan gives behaviour and test cases, never literal code; where the
code disagrees with this item, follow the code and say so in your report.

## Plan

1. `server/src/releases/releases.service.ts`: `createReleasesReader({ root: releasesRoot, git: runGit })`. Delete `compute`, the filters, `GITHUB`, `cmpVersion`, `memoKey`.
2. `findRepoRoot` from release-kit, re-exported by the service for `test/api-releases.test.ts`.
3. Shim: try deleting the `declare module 'release-kit'` shim `server/src/releases/release-kit.d.ts` (spec D6); keep it if `pnpm typecheck` or `nest build` fails, and say which.
4. Commit `refactor(releases): use release-kit's reader`.

## Test cases

- Delete `test/api-releases.test.ts`'s deep-equality-with-`readReleases` case; keep its route cases green.
- New case: "every git launch in the route goes through `runGit`" (spy on the module).
- `test/git-run.test.ts`'s no-`*Sync` grep stays green.

## Done when

- `pnpm test` passes.
- `pnpm typecheck` passes.
- `pnpm build:server` passes.
