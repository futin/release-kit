## Goal

release-kit's bump job also bumps ui-kit (which depends on release-kit as a devDependency), so ui-kit follows release-kit releases like the apps do.
Requires: the futin/ui-kit repo exists and its scaffold PR is merged.

Source: plan Task C2 in `docs/superpowers/plans/2026-10-18-shared-releases-ui.md`. The plan gives behaviour and test cases, never literal code.

## Plan

Files: `.github/workflows/self.yml` (consumers list), `test/workflows.test.mjs` (expected list), `README.md` (§Bump PRs consumer list).

1. Change the test's expected consumers list first; `npm test` red.
2. Add `futin/ui-kit` to the `bump` job's consumers and to the README list; `npm test` green.
3. Commit `ci(bump): add ui-kit as a consumer`.

## Test cases

- `self.yml` job `bump` consumers are exactly `futin/claude-agents-dashboard`, `futin/backlog-manager`, `futin/guide-manager`, `futin/ui-kit`.

## Done when

- `npm test` passes.
- `npm run typecheck` passes.
