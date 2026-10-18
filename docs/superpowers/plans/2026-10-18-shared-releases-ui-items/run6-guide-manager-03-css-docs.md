## Goal

guide-manager themes ui-kit's drawer through `--uk-*` tokens mapped onto its own, the dead releases CSS is gone, and its docs describe the shared code. Spec
D13 and Part 3.

Requires: release-kit `v1.2.0` and ui-kit `v0.2.0` are released, and this repo's `chore(deps): bump release-kit to v1.2.0` PR is merged into `main`.

Source: plan Phase E3 in futin/release-kit `docs/superpowers/plans/2026-10-18-shared-releases-ui.md`,
spec `docs/superpowers/specs/2026-10-18-shared-releases-ui-design.md`
Part 3 (local checkout `/Users/andrejajevtic/Documents/custom-projects/release-kit`). The plan gives behaviour and test cases, never literal code; where the
code disagrees with this item, follow the code and say so in your report.

## Plan

1. `shared/theme.css`: a `--uk-*` block per theme mapping onto existing tokens: `--green-ink` / `--green-tint` → feat, amber → fix, magenta → perf, red →
   breaking, `--scrim`, `--accent` → dot.
2. Delete the `releases-*`, `ui-drawer-*`, `.rail-version-dot` and `.rail-version-label` rules from `client/src/styles.css`.
3. Docs: `CLAUDE.md` releases invariant (no 10 s race; D5 memo), README §Releases.
4. Commit `refactor(releases): map ui-kit tokens and drop the old drawer CSS`.
5. Write `pnpm run docker:sync` as this PR's `## After merge` step in your report, for the PR body.

## Test cases

- `test/theme-tokens.test.ts` badge-contrast rows read the same colour pairs through the `--uk-*` mapping, with unchanged values.

## Done when

- `pnpm test` passes.
- `pnpm typecheck` passes.
- `pnpm build` passes.
