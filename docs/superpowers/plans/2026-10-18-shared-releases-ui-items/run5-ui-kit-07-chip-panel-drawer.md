## Goal

The chip, the What's new panel and the releases drawer, in one markup for all apps (guide-manager's), plus `useMediaQuery` for the host's `narrow`; the package
root exports the whole public surface. Spec D14, D15, D16 and Part 2 §Public surface.

Source: plan Task D6 in futin/release-kit `docs/superpowers/plans/2026-10-18-shared-releases-ui.md`,
spec `docs/superpowers/specs/2026-10-18-shared-releases-ui-design.md`
(local checkout `/Users/andrejajevtic/Documents/custom-projects/release-kit`). The plan gives behaviour and test cases, never literal code; where the code
disagrees with this item, follow the code and say so in your report.

Constraints (ui-kit): classes `uk-*`, custom properties `--uk-*` each with a fallback; shipped CSS has no media queries; components never import CSS. `react`
peer `^18.3 || ^19`, no `react-dom` peer. No runtime dependency on release-kit (devDependency only, spec D19). `npm run build` before `npm test`; `dist/` is
committed with every `src/` change.

## Plan

Files: create `src/releases/VersionChip.tsx`, `src/releases/ReleasesPanel.tsx`, `src/releases/ReleasesDrawer.tsx`, `src/ui/useMediaQuery.ts`; modify
`src/index.ts` (export everything in spec Part 2 §Public surface); new `test/releases-ui.test.tsx`.

Produces: `VersionChip(p: { label; dot; onClick(): void; className? })`; `ReleasesPanel(p: { data: ReleasesResponse; renderNotes?: (notes: string) =>
ReactNode })`; `ReleasesDrawer(p: { data; onClose; renderNotes?; closeOnEscape?; narrow?; restoreFocus? })`; `useMediaQuery(query: string): boolean` (false
where `matchMedia` is missing).

1. Write the cases below; run red. Implement. Run green. Commit `feat(releases): chip, panel and drawer`.

## Test cases

- The chip is a `button.uk-chip`; aria-label exactly `What's new — v0.3.0`, or `What's new — v0.3.0, new release` with `dot`; `.uk-chip-dot` only with `dot`.
- Panel on `mixed`: entries in input order with `data-testid="release-<version>"`.
- Baseline shows `Versioning starts here · v0.1.0` and a `16 Oct 2026`-style date, no badge.
- `0.2.1` shows `Fix` and `Breaking` badges; the title is shown without its prefix; a `PR #N` link only when both `url` and `pr` are set.
- Head `What's new` and `running v0.3.0` (or `+N`); `noCurrent` → no `running`.
- Empty notes → no `.uk-releases-notes`; a custom `renderNotes` output replaces the default; `hostileNotes` through the default → no `<script>` in the DOM.
- `ReleasesDrawer` passes `closeOnEscape`, `narrow` and `restoreFocus` through (one case each).
- `useMediaQuery` follows a stubbed `matchMedia` change event.

## Done when

- `npm run build` leaves `git status --porcelain dist` empty after the commit.
- `npm test` passes.
- `npm run typecheck` passes.
