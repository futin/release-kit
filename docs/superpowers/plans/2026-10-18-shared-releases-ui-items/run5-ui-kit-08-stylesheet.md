## Goal

ui-kit ships one stylesheet whose every colour, size and font is a `--uk-*` token with a neutral fallback, and the README lists the tokens, so each app themes
the drawer by mapping tokens onto its own. Spec D13.

Source: plan Task D7 in futin/release-kit `docs/superpowers/plans/2026-10-18-shared-releases-ui.md`,
spec `docs/superpowers/specs/2026-10-18-shared-releases-ui-design.md`
(local checkout `/Users/andrejajevtic/Documents/custom-projects/release-kit`). The plan gives behaviour and test cases, never literal code; where the code
disagrees with this item, follow the code and say so in your report.

Constraints (ui-kit): classes `uk-*`, custom properties `--uk-*` each with a fallback; shipped CSS has no media queries; components never import CSS. `react`
peer `^18.3 || ^19`, no `react-dom` peer. No runtime dependency on release-kit (devDependency only, spec D19). `npm run build` before `npm test`; `dist/` is
committed with every `src/` change. Prose wraps at 160 columns.

## Plan

Files: create `src/styles.css`; modify `README.md` (§Tokens: the full `--uk-*` list with each default, and one paragraph on how an app maps them); extend
`test/packaging.test.ts`.

1. Write the cases below; run red.
2. Implement the layout from guide-manager's `releases-*` / `ui-drawer-*` rules (`/Users/andrejajevtic/Documents/custom-projects/guide-manager`), colours as
   tokens; `uk-drawer--narrow` = full screen. Run green. Commit `feat(releases): stylesheet`.

Minimum tokens (spec Part 2): panel background, ink, muted ink, hairline, scrim, accent, badge ink + tint for each of `feat` / `fix` / `perf` / `breaking`,
font, mono font, radius, drawer width (default `400px`), z-index.

## Test cases

- Every `var(--uk-…)` in `src/styles.css` has a fallback (no `var(--uk-[a-z0-9-]+)` without a comma).
- No `@media` in the file.
- Every class selector starts with `.uk-`.
- Every token named in the README appears in the CSS, and every token in the CSS appears in the README.
- `dist/styles.css` equals `src/styles.css` after a build.

## Done when

- `npm run build` leaves `git status --porcelain dist` empty after the commit.
- `npm test` passes.
- `npm run typecheck` passes.
