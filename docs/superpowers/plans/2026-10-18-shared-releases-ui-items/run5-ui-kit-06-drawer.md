## Goal

A `Drawer` shell that accepts the host's dismiss and focus layer instead of owning it, so each app keeps its Escape stack or back gesture. Spec D15.

Source: plan Task D5 in futin/release-kit `docs/superpowers/plans/2026-10-18-shared-releases-ui.md`,
spec `docs/superpowers/specs/2026-10-18-shared-releases-ui-design.md`
(local checkout `/Users/andrejajevtic/Documents/custom-projects/release-kit`). The plan gives behaviour and test cases, never literal code; where the code
disagrees with this item, follow the code and say so in your report.

Constraints (ui-kit): classes `uk-*`, custom properties `--uk-*` each with a fallback; shipped CSS has no media queries; components never import CSS. `react`
peer `^18.3 || ^19`, no `react-dom` peer. No runtime dependency on release-kit (devDependency only, spec D19). `npm run build` before `npm test`; `dist/` is
committed with every `src/` change.

## Plan

Files: create `src/ui/Drawer.tsx`; new `test/drawer.test.tsx`.

Produces `Drawer(p: { label: string; onClose(): void; children: ReactNode; closeOnEscape?: boolean; narrow?: boolean; restoreFocus?: false | ((prev: Element |
null) => HTMLElement | null) })`. Markup: `div.uk-drawer-scrim` → `aside.uk-drawer[role=dialog][aria-modal=true][aria-label][tabindex=-1]` (plus
`uk-drawer--narrow` when `narrow`) → `button.uk-drawer-close[aria-label=Close]` + children.

1. Write the cases below; run red. Implement. Run green. Commit `feat(ui): Drawer shell`.

## Test cases

- Escape on `document` → `onClose` once.
- `closeOnEscape={false}` → Escape does nothing, and `document.addEventListener` was not called with `keydown`.
- ✕ click → `onClose`; scrim click → `onClose`; click inside the panel → not.
- On mount `document.activeElement` is the panel.
- On unmount focus returns to the button focused before mount; a removed opener → focus not moved to it.
- `restoreFocus={() => target}` → `target` focused; `restoreFocus={false}` → focus untouched.
- `narrow` → class `uk-drawer--narrow` present.

## Done when

- `npm run build` leaves `git status --porcelain dist` empty after the commit.
- `npm test` passes.
- `npm run typecheck` passes.
