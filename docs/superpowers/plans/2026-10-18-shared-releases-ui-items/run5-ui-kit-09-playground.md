## Goal

A dev-only playground renders every fixture under three approximate app themes, so a change to ui-kit can be seen in all three looks before it ships. Spec
D18.

Source: plan Task D8 in futin/release-kit `docs/superpowers/plans/2026-10-18-shared-releases-ui.md`,
spec `docs/superpowers/specs/2026-10-18-shared-releases-ui-design.md`
(local checkout `/Users/andrejajevtic/Documents/custom-projects/release-kit`). The plan gives behaviour and test cases, never literal code; where the code
disagrees with this item, follow the code and say so in your report.

Constraints (ui-kit): classes `uk-*`, custom properties `--uk-*` each with a fallback; shipped CSS has no media queries; components never import CSS. `react`
peer `^18.3 || ^19`, no `react-dom` peer. No runtime dependency on release-kit (devDependency only, spec D19). `npm run build` before `npm test`; `dist/` is
committed with every `src/` change. Prose wraps at 160 columns.

## Plan

Files: create `playground/index.html`, `playground/main.tsx`, `playground/themes.css` (three approximate token maps labelled guide-manager, backlog-manager,
dashboard), `vite.config.ts`; `package.json` script `dev`. Not in `files`, not built by `scripts/build.mjs`.

1. Add the packaging case below; run red (if the playground already leaks) or confirm it guards; build the playground.
2. `npm run dev` renders every fixture × three themes, each with a chip and an open panel; one button opens a real `ReleasesDrawer`. Check that `npx vite build`
   succeeds as a headless smoke; the visual look is checked by a person in the PR (attach a screenshot there if you can take one, else say so).
3. Commit `chore(playground): fixtures under three themes`.

## Test cases

- No `dist/` path contains `playground`.

## Done when

- `npm run build` leaves `git status --porcelain dist` empty after the commit.
- `npm test` passes.
- `npm run typecheck` passes.
- `npx vite build --outDir "$(mktemp -d)"` exits 0.
