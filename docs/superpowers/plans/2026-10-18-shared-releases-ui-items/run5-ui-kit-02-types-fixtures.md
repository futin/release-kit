## Goal

ui-kit owns the releases wire types and the shared fixtures every later test uses, and proves at compile time that release-kit's `ReleasesResponse` fits its
own. Spec D18, D19.

Source: plan Task D1 in futin/release-kit `docs/superpowers/plans/2026-10-18-shared-releases-ui.md`,
spec `docs/superpowers/specs/2026-10-18-shared-releases-ui-design.md`
(local checkout `/Users/andrejajevtic/Documents/custom-projects/release-kit`). The plan gives behaviour and test cases, never literal code; where the code
disagrees with this item, follow the code and say so in your report.

Constraints (ui-kit): classes `uk-*`, custom properties `--uk-*` each with a fallback; shipped CSS has no media queries; components never import CSS. `react`
peer `^18.3 || ^19`, no `react-dom` peer. No runtime dependency on release-kit (devDependency only, spec D19). `npm run build` before `npm test`; `dist/` is
committed with every `src/` change.

## Plan

Files: create `src/types.ts`, `fixtures/releases.ts`, `test/type-contract.test.ts` (a `.ts` file `tsc` checks; the test asserts `tsc` exit 0).

Produces:

- `ReleaseType = 'feat' | 'fix' | 'perf' | 'baseline'`
- `Release { version; date; title; type; scope?; pr?; breaking; notes; url? }`
- `ReleasesResponse { current: { version: string; ahead: number } | null; releases: Release[] }`
- Fixtures (plain data, named exports, not exported from the package): `baselineOnly`; `mixed`, newest first as the route answers: `perf` `0.3.0` with long
  notes, `fix` `0.2.1` breaking, `feat` `0.2.0` with PR and url, baseline `0.1.0`, `current: { version: '0.3.0', ahead: 0 }`; `noCurrent` (`mixed` with
  `current: null`); `empty` (`{ current: null, releases: [] }`); `hostileNotes` (notes with `<script>`, `<img onerror>`, a `javascript:` link, an `&` in a
  URL, a `)` in link text).

1. Write the failing type-contract file: it assigns a value of release-kit's `ReleasesResponse` to ui-kit's `ReleasesResponse`. Run: fails.
2. Implement types and fixtures. Run: passes. Commit `feat(releases): wire types and fixtures`.

## Test cases

- The type-contract file compiles under `npm run typecheck`, and the test sees `tsc` exit 0.
- Each fixture is assignable to `ReleasesResponse`.

## Done when

- `npm run build` leaves `git status --porcelain dist` empty after the commit.
- `npm test` passes.
- `npm run typecheck` passes.
