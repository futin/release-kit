## Goal

release-kit's types resolve for consumers compiling with `moduleResolution: node` (the Nest apps), so guide-manager and backlog-manager can drop or keep their
`declare module 'release-kit'` shim by choice, not by necessity. Spec D6.

Source: plan Task B3 in `docs/superpowers/plans/2026-10-18-shared-releases-ui.md`,
spec `docs/superpowers/specs/2026-10-18-shared-releases-ui-design.md` (D6).
The plan gives behaviour and test cases, never literal code; where the code disagrees, follow the code and say so in your report.

## Plan

Files: modify `package.json`; new `test/types-node10.test.ts`; new fixture dir `test/fixtures/node10/` (a `tsconfig.json` with `moduleResolution: "node"` and
`module: "commonjs"`, plus two `.ts` files).

1. `package.json`: top-level `"types": "./dist/esm/index.d.ts"` and `"main": "./dist/cjs/index.js"`; devDependency alias
   `"typescript-5": "npm:typescript@5.9.3"`. Release-kit's own TypeScript 7 rejects `moduleResolution: node` with TS5108; 5.9.3 is what the Nest apps compile with.
2. Write the failing test: it links the package into a tmp `node_modules/release-kit` and runs `node_modules/typescript-5/bin/tsc --noEmit -p` on the fixture,
   never the root `tsc`. Exit 0 = pass.
3. Run it: fails (no `types`). Add the fields. Run: passes.
4. Commit `fix(package): resolve types under node10` (with `package-lock.json`).

## Test cases

- Fixture file 1: `import { readReleases, createReleasesReader } from 'release-kit'` typechecks.
- Fixture file 2: `export * from 'release-kit/dist/esm/index'` inside a `declare module 'release-kit'` shim (guide-manager's exact shim) typechecks and still
  exports `readReleases`.

## Done when

- `npm test` passes.
- `npm run typecheck` passes.
