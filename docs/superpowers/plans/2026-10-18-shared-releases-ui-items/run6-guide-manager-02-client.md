## Goal

guide-manager's version chip and What's new drawer come from ui-kit; the app keeps only a thin wrapper with its own focus fallback, phone breakpoint and
sanitiser. Its last-seen key stays `guide-manager.releases-last-seen`. Spec D14–D17.

Requires: release-kit `v1.2.0` and ui-kit `v0.2.0` are released, and this repo's `chore(deps): bump release-kit to v1.2.0` PR is merged into `main`.

Source: plan Phase E2 in futin/release-kit `docs/superpowers/plans/2026-10-18-shared-releases-ui.md`,
spec `docs/superpowers/specs/2026-10-18-shared-releases-ui-design.md`
Part 3 (local checkout `/Users/andrejajevtic/Documents/custom-projects/release-kit`). The plan gives behaviour and test cases, never literal code; where the
code disagrees with this item, follow the code and say so in your report.

## Plan

1. `pnpm add github:futin/ui-kit#v0.2.0`.
2. Delete `client/src/lib/releases.ts`, `client/src/hooks/useReleases.ts`, `client/src/components/ui/Drawer.tsx`.
3. Rewrite `client/src/components/ReleasesDrawer.tsx` as a wrapper around ui-kit's `ReleasesDrawer`: `restoreFocus` = the `restoreTarget` moved out of the
   deleted `ui/Drawer.tsx` (the ☰ fallback); `narrow = useMediaQuery('(max-width: 639px)')`; `renderNotes` = a `div.uk-releases-notes` whose HTML is
   `sanitizeSnapshot(renderNotesHtml(notes))`.
4. `App.tsx` uses `useWhatsNew({ storageKey: 'guide-manager.releases-last-seen' })`. `SideRail` renders `VersionChip` with `className="rail-version"` and an
   `onClick` that also closes the phone menu.
5. `client/src/main.tsx` imports `ui-kit/styles.css`.
6. Commit `refactor(releases): use ui-kit's drawer`.

## Test cases

- `test/releases-ui.test.tsx` keeps the rail and menu cases, rewritten against the new markup: chip present; dot shown; the phone menu closes on tap; no chip
  on `current: null`.
- One case: a notes link keeps `rel="noopener"` (from `sanitizeSnapshot`).
- `test/releases-lib.test.ts` is deleted (its subject moved to ui-kit).

## Done when

- `pnpm test` passes.
- `pnpm typecheck` passes.
- `pnpm build` passes.
