## Goal

claude-agents-dashboard accepts any exact release-kit tag, so the `chore(deps): bump release-kit to vX.Y.Z` PRs that release-kit's bump workflow will open
can pass this repo's CI. Today `test/server-deps.test.ts` hard-codes `v1.1.0` and would fail every bump PR. Spec Part 0. Must merge before release-kit's
Phase B PR merges.

Source: plan Task A1 in futin/release-kit `docs/superpowers/plans/2026-10-18-shared-releases-ui.md`,
spec `docs/superpowers/specs/2026-10-18-shared-releases-ui-design.md`
(local checkout `/Users/andrejajevtic/Documents/custom-projects/release-kit`). The plan gives behaviour and test cases, never literal code; where the code
disagrees with this item, follow the code and say so in your report.

## Plan

1. Modify `test/server-deps.test.ts` only: the `PINNED` table and its assertion.
2. Extract an exported predicate `isExactKitPin(spec: string): boolean`, true when the spec matches `^github:futin/release-kit#v\d+\.\d+\.\d+$`.
3. Use it for `release-kit` only; `lookout-widgets` keeps its literal pin.
4. Update the file's header comment: still "no floating ref", now "any exact tag".
5. Write the cases below first and run `pnpm test` red (predicate missing), then implement and run green.
6. Commit `test(deps): accept any exact release-kit tag`.

## Test cases

- `github:futin/release-kit#v1.1.0` → true; `github:futin/release-kit#v1.2.0` → true.
- `#v1` → false; `#main` → false; `github:futin/release-kit` with no ref → false; `#v1.2.0-rc1` → false.
- The repo's own package.json still passes; `lookout-widgets` is still checked against its literal pin.

## Done when

- `pnpm test` passes.
- `pnpm typecheck` passes.
