## Goal

The dashboard themes ui-kit's drawer through `--uk-*` tokens, the dead `rel-*` drawer CSS is gone, and the Playwright visual baselines show the new look (✕ in
the corner, the baseline's date). Spec D13, D16.

Requires: release-kit `v1.2.0` and ui-kit `v0.2.0` are released, and this repo's `chore(deps): bump release-kit to v1.2.0` PR is merged into `main`.

Source: plan Phase G in futin/release-kit `docs/superpowers/plans/2026-10-18-shared-releases-ui.md`,
spec `docs/superpowers/specs/2026-10-18-shared-releases-ui-design.md`
Part 3 (local checkout `/Users/andrejajevtic/Documents/custom-projects/release-kit`). The plan gives behaviour and test cases, never literal code; where the
code disagrees with this item, follow the code and say so in your report.

## Plan

1. `--uk-*` mapping in `client/src/styles.css`.
2. Delete the `rel-*` drawer rules and `.rel-dot`; keep `.rel-chip` placement.
3. Re-shoot the drawer and chip visual baselines: `pnpm test:visual --update-snapshots`. List the changed snapshot files in your report so a person reviews the
   diff images in the PR.
4. `docs/subsystems/releases.md`: the reader and drawer now come from release-kit and ui-kit.
5. Write the dashboard's dependency-refresh step as this PR's `## After merge` line in your report.
6. Commit `fix(releases): map ui-kit tokens and re-shoot drawer baselines`.

## Test cases

- `pnpm test:visual` passes against the re-shot baselines.

## Done when

- `pnpm test` passes.
- `pnpm typecheck` passes.
- `pnpm build` passes.
- `pnpm test:visual` passes.
