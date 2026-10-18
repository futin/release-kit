## Goal

release-kit exports a memoised releases reader, so each app stops carrying its own memo key, in-flight sharing and repo-root lookup. Spec D4 and D5.

Source: plan Task B2 and the reader half of Task B6 in `docs/superpowers/plans/2026-10-18-shared-releases-ui.md`, spec
`docs/superpowers/specs/2026-10-18-shared-releases-ui-design.md` (D4, D5, Testing). The plan gives behaviour and test cases, never literal code; where the code
disagrees, follow the code and say so in your report.

Constraints: `npm run build` before `npm test`; `dist/` committed with the change. Prose wraps at 160 columns.

## Plan

Files: create `src/releases-reader.ts`; modify `src/index.ts`, `README.md`; new `test/releases-reader.test.ts`; modify `test/fixtures/repo.ts` (add
`worktree(path: string): string`, which runs `git worktree add` and returns the path).

Consumes the previous item's `readReleasesResult`, `GitPort`, `ReadOptions`. Produces:

- `createReleasesReader(opts: { root: string | (() => string | null) } & ReadOptions): ReleasesReader`
- `type ReleasesReader = { read(): Promise<ReleasesResponse> }`
- `findRepoRoot(from: string): string | null`: the first ancestor holding a `.git` entry, file or directory.

Steps:

1. Write the failing tests below. A "read" = one `for-each-ref` launch on a recording port.
2. `npm run build && npm test`: fail.
3. Implement per spec D4: key = root + HEAD + mtime of `packed-refs` + mtime of `refs/tags`, the common git dir resolved against root, a missing path counts as
   `0`, async `stat`. Only complete answers are memoised. The in-flight entry is shared per key and cleared only if still current.
4. README §Reading releases from a server: rewrite it around `createReleasesReader`, with the git port, and the Nest and raw-`http` mounts as one-liners.
5. `npm run build && npm test && npm run typecheck` pass. Commit `feat(releases): memoised releases reader`, with `dist/`.

## Test cases

- Two sequential `read()` under one key → 1 read; two concurrent → 1 read.
- Commit after the first read → 2 reads, and `current.ahead` goes 0 → 1.
- Annotated tag cut on an old commit without moving HEAD → 2 reads, new release present.
- `git pack-refs --all` after the first read → 2 reads.
- Port returning `null` for `describe` (incomplete) → the next `read()` re-reads (2 reads over 2 calls).
- Tagless checkout → 1 read over 2 calls (a complete empty answer is memoised, spec D5).
- One commit, no tags, no `packed-refs` → key built without throwing, memoised.
- Root function returning `null` → empty shape, and the port is never called.
- Root function read per call: switch an env var between calls → the second call reads the second repo.
- Linked worktree root → releases of the main checkout; a tag cut in the main checkout moves the key seen from the worktree.
- Port returning `null` for `rev-parse` → answer served, not memoised (2 reads over 2 calls).
- `findRepoRoot`: nested dir of a repo → repo root; worktree subdir → worktree root (`.git` is a file); `/` with no repo → `null`.

## Done when

- `npm run build` leaves `git status --porcelain dist` empty after the commit.
- `npm test` passes.
- `npm run typecheck` passes.
