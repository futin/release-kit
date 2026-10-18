## Goal

backlog-manager's chip and What's new drawer come from ui-kit, and the drawer stays the sixth entry on the app's Escape stack. The last-seen key stays
`backlog-manager.releases-last-seen`. Spec D14–D17.

Requires: release-kit `v1.2.0` and ui-kit `v0.2.0` are released, and this repo's `chore(deps): bump release-kit to v1.2.0` PR is merged into `main`.

Source: plan Phase F2 in futin/release-kit `docs/superpowers/plans/2026-10-18-shared-releases-ui.md`,
spec `docs/superpowers/specs/2026-10-18-shared-releases-ui-design.md`
Part 3 (local checkout `/Users/andrejajevtic/Documents/custom-projects/release-kit`). The plan gives behaviour and test cases, never literal code; where the
code disagrees with this item, follow the code and say so in your report.

## Plan

1. `pnpm add github:futin/ui-kit#v0.2.0`.
2. Delete `client/src/lib/releases.ts`, `client/src/hooks/useReleases.ts`, `client/src/components/ui/Drawer.tsx`.
3. `client/src/components/ReleasesDrawer.tsx` becomes a wrapper that calls `useDialogEscape(onClose)` and renders ui-kit's `ReleasesDrawer` with `closeOnEscape={false}`,
   `narrow={useNarrow()}`, and `renderNotes` = a `div` with `renderMarkdown(notes)`.
4. App uses `useWhatsNew({ storageKey: 'backlog-manager.releases-last-seen' })`. SideRail renders `VersionChip` with `className="rail-release"` (its existing
   class). The client entry imports `ui-kit/styles.css`.
5. Commit `refactor(releases): use ui-kit's drawer`.

## Test cases

- `test/dialog-escape.test.tsx`'s "closes the What's new drawer over an open item modal" case stays green under `closeOnEscape={false}` + `useDialogEscape`.
- `releases-drawer.test.tsx` and `releases-app.test.tsx` keep their wiring cases.
- `releases-lib.test.ts` is deleted.

## Done when

- `pnpm test` passes.
- `pnpm typecheck` passes.
- `pnpm build` passes.
