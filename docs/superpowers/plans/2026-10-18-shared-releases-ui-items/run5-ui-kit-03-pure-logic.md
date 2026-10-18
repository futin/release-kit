## Goal

ui-kit holds the pure releases logic the three apps each carry today: version compare, chip label, title cleanup, dot state, last-seen storage, date format,
response guard. Spec Part 2 §Public surface, D17.

Source: plan Task D2 in futin/release-kit `docs/superpowers/plans/2026-10-18-shared-releases-ui.md`,
spec `docs/superpowers/specs/2026-10-18-shared-releases-ui-design.md`
(local checkout `/Users/andrejajevtic/Documents/custom-projects/release-kit`). The plan gives behaviour and test cases, never literal code; where the code
disagrees with this item, follow the code and say so in your report.

Constraints (ui-kit): classes `uk-*`, custom properties `--uk-*` each with a fallback; shipped CSS has no media queries; components never import CSS. `react`
peer `^18.3 || ^19`, no `react-dom` peer. No runtime dependency on release-kit (devDependency only, spec D19). `npm run build` before `npm test`; `dist/` is
committed with every `src/` change.

## Plan

Files: create `src/releases/logic.ts`; new `test/logic.test.ts`.

Produces: `isVersion(s: unknown): s is string`; `compareVersions(a, b): number`; `chipLabel(current: { version: string; ahead: number }): string`;
`displayTitle(title: string): string`; `TYPE_LABEL` (`feat` → `Feature`, `fix` → `Fix`, `perf` → `Performance`); `dotState(newest: string | null, stored:
string | null, open: boolean): { dot: boolean; seed: string | null }`; `readLastSeen(key: string): string | null`; `writeLastSeen(key: string, v: string):
void`; `formatReleaseDate(iso: string): string`; `isReleasesResponse(v: unknown): v is ReleasesResponse`.

1. Write the cases below; run red.
2. Implement by porting guide-manager's `client/src/lib/releases.ts` behaviour (`/Users/andrejajevtic/Documents/custom-projects/guide-manager`), with the
   storage key as a parameter. Run green. Commit `feat(releases): pure logic`.

## Test cases

- `dotState(null,'0.1.0',false)` → `{dot:false,seed:null}`; `('0.2.0',null,false)` → `{dot:false,seed:'0.2.0'}`; `('0.2.0','v0.2.0',false)` →
  `{dot:false,seed:'0.2.0'}`; `('0.3.0','0.2.0',false)` → `{dot:true,seed:null}`; `('0.2.0','0.2.0',false)` → `{dot:false,seed:null}`;
  `('0.3.0','0.2.0',true)` → `{dot:false,seed:'0.3.0'}`; `('0.2.0','0.3.0',true)` → `{dot:false,seed:null}`.
- `compareVersions('0.10.0','0.9.0') > 0`.
- `chipLabel` → `v0.2.0` (ahead 0), `v0.2.0+3` (ahead 3).
- `displayTitle('feat(rail)!: x')` → `x`; `('fix: y')` → `y`; `('Baseline — versioning starts here')` unchanged.
- `formatReleaseDate('2026-10-16T09:00:00Z')` → `16 Oct 2026`; `('junk')` → `junk`.
- `readLastSeen` / `writeLastSeen` with a throwing `localStorage` → `null` / no throw.
- `isReleasesResponse`: accepts `empty` and `mixed`; rejects `'<html>'`, `{ releases: {} }`, `{ current: { version: '1.0.0' }, releases: [] }`.

## Done when

- `npm run build` leaves `git status --porcelain dist` empty after the commit.
- `npm test` passes.
- `npm run typecheck` passes.
