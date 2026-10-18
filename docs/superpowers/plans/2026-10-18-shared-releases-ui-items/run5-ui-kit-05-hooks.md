## Goal

Two hooks give an app the releases data and the chip's state: fetch, refetch on open, dot from last-seen storage, never writing a lower version back. Spec
Part 2 §Public surface, D17.

Source: plan Task D4 in futin/release-kit `docs/superpowers/plans/2026-10-18-shared-releases-ui.md`,
spec `docs/superpowers/specs/2026-10-18-shared-releases-ui-design.md`
(local checkout `/Users/andrejajevtic/Documents/custom-projects/release-kit`). The plan gives behaviour and test cases, never literal code; where the code
disagrees with this item, follow the code and say so in your report.

Constraints (ui-kit): classes `uk-*`, custom properties `--uk-*` each with a fallback; shipped CSS has no media queries; components never import CSS. `react`
peer `^18.3 || ^19`, no `react-dom` peer. No runtime dependency on release-kit (devDependency only, spec D19). `npm run build` before `npm test`; `dist/` is
committed with every `src/` change.

## Plan

Files: create `src/releases/useReleases.ts`, `src/releases/useWhatsNew.ts`; new `test/hooks.test.tsx` (jsdom, stubbed `fetch` and storage).

Consumes the pure logic (`dotState`, `readLastSeen`, `writeLastSeen`, `chipLabel`, `isReleasesResponse`). Produces:

- `useReleases(url = '/api/releases'): { data: ReleasesResponse | null; refresh(): void }`
- `useWhatsNew(o: { storageKey: string; url?: string }): { data: ReleasesResponse | null; chip: { label: string; dot: boolean } | null; open: boolean;
  show(): void; close(): void }`

1. Write the cases below; run red. Implement. Run green. Commit `feat(releases): useReleases and useWhatsNew`.

## Test cases

- First answer `mixed`, empty storage → `chip` `{ label: 'v0.3.0', dot: false }`, storage `0.3.0`.
- Storage `0.2.1`, then answer `mixed` → `dot: true`.
- `show()` → `open: true` synchronously, one extra fetch fired, `dot: false`, storage `0.3.0`.
- Storage that throws → after the seed `dot: false`, no throw, still `false` after a re-render.
- Refetch rejecting → `data` and `chip` unchanged. Body `'<html>'` → previous data kept.
- `noCurrent` → `chip: null`.
- A `fetch` resolving after `unmount()` → nothing written to storage and `console.error` not called (spy); the test exits cleanly.
- Storage `0.9.0`, answer newest `0.5.0`, `show()` → storage still `0.9.0`.
- `show()` then the refetch rejects → `open` stays `true`, `data` is the earlier answer.

## Done when

- `npm run build` leaves `git status --porcelain dist` empty after the commit.
- `npm test` passes.
- `npm run typecheck` passes.
