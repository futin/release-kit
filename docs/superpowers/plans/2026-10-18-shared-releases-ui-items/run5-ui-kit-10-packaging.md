## Goal

The built package is consumable by both module systems with React taken from the consumer, and the README says how an app adopts it. Spec D7 and Part 2
§Public surface.

Source: plan Task D9 in futin/release-kit `docs/superpowers/plans/2026-10-18-shared-releases-ui.md`,
spec `docs/superpowers/specs/2026-10-18-shared-releases-ui-design.md`
(local checkout `/Users/andrejajevtic/Documents/custom-projects/release-kit`). The plan gives behaviour and test cases, never literal code; where the code
disagrees with this item, follow the code and say so in your report.

Constraints (ui-kit): classes `uk-*`, custom properties `--uk-*` each with a fallback; shipped CSS has no media queries; components never import CSS. `react`
peer `^18.3 || ^19`, no `react-dom` peer. No runtime dependency on release-kit (devDependency only, spec D19). `npm run build` before `npm test`; `dist/` is
committed with every `src/` change. Prose wraps at 160 columns.

## Plan

Files: extend `test/packaging.test.ts`; modify `README.md` (§Consuming); `dist/` via `npm run build`.

1. Add the cases below; run red where they fail.
2. README §Consuming: the install line; `import 'ui-kit/styles.css'` once in the client entry; the three host wrappers as one-line sketches (Escape stack, back
   gesture, default).
3. `npm run build`, `npm test`, `npm run typecheck`. Commit `docs: consuming ui-kit`.

## Test cases

- `require('dist/cjs/index.js')` and `import('dist/esm/index.js')` both expose `ReleasesDrawer`, `useWhatsNew`, `renderNotesHtml`.
- React resolves from the consumer (peer), not bundled: no `react` code in `dist/`.

## Done when

- `npm run build` leaves `git status --porcelain dist` empty after the commit.
- `npm test` passes.
- `npm run typecheck` passes.
