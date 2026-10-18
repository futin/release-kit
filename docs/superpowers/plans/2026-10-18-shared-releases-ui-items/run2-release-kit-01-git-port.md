## Goal

release-kit's releases reader is bounded (timeout, `maxBuffer`) and runs git through an injectable port, and reports whether its answer is complete, so apps
can pass their own git runner and a memoiser can skip caching partial answers. Spec D2, D3, D5 and Part 1 §Server API.

Source: plan Task B1 in `docs/superpowers/plans/2026-10-18-shared-releases-ui.md`,
spec `docs/superpowers/specs/2026-10-18-shared-releases-ui-design.md`. Read
spec Part 1 first. The plan gives behaviour and test cases, never literal code; where the code disagrees, follow the code and say so in your report.

Constraints: `src/` changes need `npm run build` before `npm test`, and `dist/` is committed with the change (the dist-drift test fails otherwise). The root export
stays React-free. Default read timeout `10_000` ms; `for-each-ref` `maxBuffer` `32 * 1024 * 1024`; the default port honours `o.maxBuffer`.

## Plan

Files: modify `src/git.ts`, `src/read-releases.ts`, `src/index.ts`; extend `test/read-releases.test.ts`; new `test/fixtures/fake-git.sh`.

Produces (later items rely on these exact names):

- `type GitPort = (args: string[], o: { cwd: string; maxBuffer?: number }) => Promise<string | null>`
- `type ReadOptions = { timeoutMs?: number; git?: GitPort }`
- `readReleasesResult(root: string, opts?: ReadOptions): Promise<{ value: ReleasesResponse; complete: boolean }>`
- `readReleases(root: string, opts?: ReadOptions): Promise<ReleasesResponse>` (= `.value`)
- `defaultGitPort(timeoutMs?: number): GitPort`, exported from `src/index.ts` too (the dashboard's server may import only the bare `release-kit` specifier)
- `git(cwd, args, o?: { timeoutMs?: number; maxBuffer?: number })`; the release engine keeps calling it without options (unbounded, throwing).

Steps:

1. Write the failing tests below; every existing case in the file keeps passing untouched.
2. `npm run build && npm test`: the new cases fail.
3. Implement. Reader reads go through the port; `versionTags` gains a variant that takes the port (the release engine's own `versionTags` call is unchanged);
   `null` from `for-each-ref` short-circuits to empty and incomplete; parsing tolerates a trailing `\n` after the last `\0`.
4. `npm run build && npm test && npm run typecheck` pass; `test/release.test.ts` untouched and green.
5. Commit `feat(releases): bound the reader and take a git port`, with `dist/`.

## Test cases

- Recording port: the argv lists a custom port receives equal those the default port would run, three reads: `for-each-ref` with the tag format,
  `remote get-url origin`, `describe --long` + `DESCRIBE_FILTER`; `for-each-ref` carries `maxBuffer` 33554432.
- Port returning `null` for `for-each-ref` → `{ value: { current: null, releases: [] }, complete: false }`.
- Port returning `null` for `describe` only, repo with baseline + one release → releases length 2, `current: null`, `complete: false`.
- Branch cut before the baseline (HEAD descends from no tag) → releases kept, `current: null`, `complete: false`.
- Port returning `null` for `remote get-url` with a GitHub-PR release → no `url` on it, `complete: true`.
- Repo with no version tags → empty shape, `complete: true`.
- A port wrapping the default that trims stdout vs one that returns it untrimmed, on a repo whose tag message has CRLF endings and a trailing blank line →
  deep-equal results.
- `v0.9.0` and `v0.10.0` tagged in the same second through a custom port → `releases[0].version === '0.10.0'`.
- Default port with `PATH` prefixed by a dir holding `fake-git.sh` as `git` (sleeps 30 s, traps TERM and kills its own `sleep`), `timeoutMs: 200` → resolves
  in under 2 000 ms with `complete: false` and the empty shape.

## Done when

- `npm run build` leaves `git status --porcelain dist` empty after the commit.
- `npm test` passes.
- `npm run typecheck` passes.
