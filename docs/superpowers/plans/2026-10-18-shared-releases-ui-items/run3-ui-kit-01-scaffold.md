## Goal

The new futin/ui-kit repo builds, tests and releases like release-kit: committed ESM + CJS + `.d.ts` dist, CI through release-kit's reusable workflows, and a
`bump` job that opens bump PRs in the three apps on every ui-kit release. Spec Part 2 §Setup, D7, D18, D19.

Requires: the user has created the public repo `futin/ui-kit`, cloned it, and connected its backlog. The repo is empty apart from that.

Source: plan Task C1 in futin/release-kit `docs/superpowers/plans/2026-10-18-shared-releases-ui.md`,
spec `docs/superpowers/specs/2026-10-18-shared-releases-ui-design.md`
(local checkout `/Users/andrejajevtic/Documents/custom-projects/release-kit`). The plan gives behaviour and test cases, never literal code; where the code
disagrees with this item, follow the code and say so in your report.

Constraints (ui-kit): classes `uk-*`, custom properties `--uk-*` each with a fallback; shipped CSS has no media queries; components never import CSS. `react`
peer `^18.3 || ^19`, no `react-dom` peer. No runtime dependency on release-kit (devDependency only, spec D19). `npm run build` before `npm test`; `dist/` is
committed with every `src/` change.

## Plan

Files (all new): `package.json`, `tsconfig*.json`, `scripts/build.mjs`, `src/index.ts`, `test/dist-drift.test.ts`, `test/packaging.test.ts`,
`.github/workflows/ci.yml`, `.github/workflows/release.yml`, `.github/pull_request_template.md`, `README.md`, `LICENSE`.

1. `package.json`: name `ui-kit`, private, `type: module`; `exports` `.` → esm/cjs/types and `./styles.css` → `./dist/styles.css`; top-level `types` and
   `main`; `files: ["dist"]`; peer `react ^18.3 || ^19`; devDeps `react`, `react-dom`, `@types/react`, `typescript`, the test runner, `jsdom`, `vite`,
   `@vitejs/plugin-react`, and `release-kit` as `github:futin/release-kit#v1.2.0`. Scripts `build`, `test`, `typecheck`.
2. `tsconfig*.json` with `jsx: react-jsx`. `scripts/build.mjs` emits esm + cjs + `.d.ts` and copies `src/styles.css` to `dist/` (an empty stylesheet for now).
   `src/index.ts` is an empty export.
3. `ci.yml` through `ci-node.yml@v1`, check commands `npm run typecheck` and `npm test`. `release.yml` in release-kit README §Adopting releases shape, plus a
   `bump` job `needs: release` calling `futin/release-kit/.github/workflows/bump-consumers.yml@v1` with `package: ui-kit`, `repository: futin/ui-kit`,
   consumers the three apps (`futin/claude-agents-dashboard`, `futin/backlog-manager`, `futin/guide-manager`), `token: ${{ secrets.BUMP_TOKEN }}`.
4. `pull_request_template.md` with `## What's new` above `## Why this shape`. `README.md`: what it is, a token-contract placeholder, how to consume, and
   "Storybook later — trigger: first multi-state primitive". `LICENSE` MIT.
5. Write the tests below first, `npm test` red; implement, `npm run build`; `npm test` and `npm run typecheck` green.
6. Commit `chore: scaffold ui-kit` (no release: `chore`).

## Test cases

- dist-drift (copy release-kit's): a fresh build equals the committed `dist/`.
- Packaging: `dist/esm/index.js`, `dist/cjs/index.js`, `dist/esm/index.d.ts`, `dist/styles.css` exist.
- Packaging: no file under `dist/` contains `import '...css'` or `require('...css')`.

## Done when

- `npm run build` leaves `git status --porcelain dist` empty after the commit.
- `npm test` passes.
- `npm run typecheck` passes.
