## Goal

backlog-manager themes ui-kit's drawer through `--uk-*` tokens, the dead drawer CSS is gone, and its docs describe the git port and the shared drawer. Spec
D13 and Part 3.

Requires: release-kit `v1.2.0` and ui-kit `v0.2.0` are released, and this repo's `chore(deps): bump release-kit to v1.2.0` PR is merged into `main`.

Source: plan Phase F3 in futin/release-kit `docs/superpowers/plans/2026-10-18-shared-releases-ui.md`,
spec `docs/superpowers/specs/2026-10-18-shared-releases-ui-design.md`
Part 3 (local checkout `/Users/andrejajevtic/Documents/custom-projects/release-kit`). The plan gives behaviour and test cases, never literal code; where the
code disagrees with this item, follow the code and say so in your report.

## Plan

1. `--uk-*` mapping in `client/src/styles.css` (the dot stays cyan, as today).
2. Delete the `ui-drawer-*`, `releases-*` and `.rail-release-dot` rules.
3. Docs: `docs/subsystems/releases.md` (its why-not-`readReleases` section replaced by "the git port"); `.claude/DESIGN.md` §8.7 and §8.10; the docs-sync
   stamp sources.
4. Check whether `pnpm run docker:sync` refreshes the `node_modules` volume with a new dependency (it does not remove the volume); write the step that actually
   does as this PR's `## After merge` line in your report.
5. Commit `refactor(releases): map ui-kit tokens and drop the old drawer CSS`.

## Test cases

- `test/daylight-contrast.test.ts` gains rows for the badge pairs from the mapping, and they pass.

## Done when

- `pnpm test` passes.
- `pnpm typecheck` passes.
- `pnpm build` passes.
