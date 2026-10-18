## Goal

The dashboard's chip and What's new drawer come from ui-kit, behind a wrapper that keeps its back-gesture close, and it adopts the "never write a lower
last-seen" fix. The last-seen key stays `dashboard.releases.lastSeen`. Spec D14–D17.

Requires: release-kit `v1.2.0` and ui-kit `v0.2.0` are released, and this repo's `chore(deps): bump release-kit to v1.2.0` PR is merged into `main`.

Source: plan Phase G in futin/release-kit `docs/superpowers/plans/2026-10-18-shared-releases-ui.md`,
spec `docs/superpowers/specs/2026-10-18-shared-releases-ui-design.md`
Part 3 (local checkout `/Users/andrejajevtic/Documents/custom-projects/release-kit`). The plan gives behaviour and test cases, never literal code; where the
code disagrees with this item, follow the code and say so in your report.

## Plan

1. `pnpm add github:futin/ui-kit#v0.2.0`.
2. Delete `client/src/lib/releases.ts`'s moved functions (keep only what something else still imports; grep first) and `client/src/hooks/useReleases.ts`.
3. `client/src/components/ReleasesDrawer.tsx` becomes a wrapper that calls `useBackClose(onClose)` and renders ui-kit's `ReleasesDrawer` with `narrow={useNarrow()}` and
   `renderNotes={(t) => <Markdown text={t} />}`.
4. App uses `useWhatsNew({ storageKey: 'dashboard.releases.lastSeen' })`. SideRail renders `VersionChip` with `className="rel-chip"`. The client entry imports
   `ui-kit/styles.css`.
5. Commit `fix(releases): use ui-kit's drawer`.

## Test cases

- `test/releases-client.test.ts` keeps its app-specific cases.
- New: "stored `0.9.0`, newest `0.5.0`, open → storage stays `0.9.0`" (the D17 fix). It deliberately duplicates ui-kit's hook case as app-level proof the fix
  landed; do not delete it as a duplicate.

## Done when

- `pnpm test` passes.
- `pnpm typecheck` passes.
- `pnpm build` passes.
