## Goal

A script opens, refreshes or skips one consumer's bump PR for one release, and closes superseded bump PRs. The reusable workflow (next item) runs it once per
consumer. Spec D10–D12 and Part 1 §Bump workflow.

Source: plan Task B4 in `docs/superpowers/plans/2026-10-18-shared-releases-ui.md`,
spec `docs/superpowers/specs/2026-10-18-shared-releases-ui-design.md`
(Part 1 §Bump workflow, steps 3–4). The plan gives behaviour and test cases, never literal code; where the code disagrees, follow the code and say so in your report.

Constraints: bump PR title exactly `chore(deps): bump <package> to vX.Y.Z`; branch exactly `bump/<package>-vX.Y.Z`; secret name `BUMP_TOKEN`.

## Plan

Files: create `scripts/bump-consumer.mjs`; new `test/bump-consumer.test.mjs`.

Produces `bumpConsumer(o: { pkg, repository, consumer, version, dir, run })` → `{ outcome: 'pinned' | 'open' | 'closed' | 'missing' | 'opened', pr?: number,
closed: number[] }`. `dir` is the consumer checkout. `run(cmd: string, args: string[], opts?) => Promise<{ code: number; stdout: string }>` is the only way it
launches `git`, `gh`, `pnpm`, `npm`.

CLI: reads `PKG`, `REPOSITORY`, `CONSUMER`, `VERSION`, `VERSIONS` (newest-first, space-separated), `GH_TOKEN` from env; `dir` = cwd. Exit 0 for every outcome
except a failed command; prints a `::warning::` for `missing`. Newest-version discovery stays out of this script: the workflow passes `VERSION`.

1. Write the failing tests below with a fake `run` that records calls and answers `gh` from a script; versions `v0.3.0` newest.
2. `npm test`: fail. Implement. `npm test`: pass.
3. Commit `feat(bump): bump-consumer script`.

## Test cases

- Dependency already `github:futin/ui-kit#v0.3.0` → `pinned`, no `git push`, no `gh pr create`.
- Open PR on `bump/ui-kit-v0.3.0` → `open`, no push.
- Closed unmerged PR on that branch (declined) → `closed`, no push, no create.
- Closed merged PR on that branch → `closed`, no push.
- Branch exists on the remote, no PR → push is `--force`, PR created → `opened`.
- Behind, nothing exists → `package.json` dependency rewritten (other fields byte-identical, formatting kept); `pnpm install --lockfile-only` for a
  `pnpm-lock.yaml` consumer, `npm install --package-lock-only` for a `package-lock.json` one; commit by `github-actions[bot]`; force-push; `gh pr create` with
  title exactly `chore(deps): bump ui-kit to v0.3.0`. The body contains the retitle hint, an "After merge" line about refreshing `node_modules`, and, for a
  consumer pinned at `v0.1.0` with `VERSIONS` `v0.3.0 v0.2.0 v0.1.0`, exactly the two links `https://github.com/futin/ui-kit/releases/tag/v0.3.0` and
  `https://github.com/futin/ui-kit/releases/tag/v0.2.0`.
- Dependency under `devDependencies` → updated there.
- Dependency absent → `missing`, warning text exactly `futin/x does not depend on ui-kit yet`, no branch, exit 0.
- Open `bump/ui-kit-v0.2.0` PR and outcome `opened` → that PR closed with a comment naming the new PR number; `closed: [n]`.
- Already pinned and an older `bump/ui-kit-v0.2.0` open → closed with a comment saying the consumer is already on `v0.3.0`; no new PR.
- Outcome `open` (current PR exists) and an older `bump/ui-kit-v0.2.0` open → the older one closed.
- Open `bump/ui-kit-v0.4.0` (newer than newest, a manual oddity) → left open.
- `gh` answering 401 → exit 1 with a message naming `BUMP_TOKEN`.

## Done when

- `npm test` passes.
- `npm run typecheck` passes.
