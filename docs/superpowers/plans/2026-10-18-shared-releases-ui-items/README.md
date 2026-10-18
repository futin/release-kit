# Shared releases UI — orchestrator items

The plan [`../2026-10-18-shared-releases-ui.md`](../2026-10-18-shared-releases-ui.md) split into 26 task items, each sized for one `backlog-orchestrate`
dispatch (one headless `backlog-execute` session, one review, one verify). Every file here is an item body with the four task headings (`## Goal`, `## Plan`,
`## Test cases`, `## Done when`), ready for `backlog.mjs new tasks "<title>" --body <file>`. The plan and spec stay the source of truth; each item copies the
part it needs and cites the rest, because a session in another repo's worktree does not have release-kit's tree.

The orchestrator works one repo per run, and these items span five repos with user gates between them (secrets, repo creation, merges, tags). So the work is
eight runs, started by hand in order. Nothing here starts a run.

## Before the first run

- Release-kit PR 2 (this plan) merged, so every item's `Source:` path exists on release-kit `main` — done.
- All five repos are connected to their GitHub trackers, so every run uses `--merge-mode pr` and ends in one PR.

## Filing

All items are filed up front as GitHub issues, per repo in the order listed (the Issue column in §Titles). Each issue body is its file here; the files stay as
the record of what was filed. Run `--ids` takes the issue numbers in table order.

## The runs

Every run: `/backlog-orchestrate <--ids below, in that order> --merge-mode pr` from the repo root, base `main`. PR mode titles its PR
`<type>(backlog): N items`; **retitle it to the run's PR title below before the squash merge**, because the squash title decides the release.

| Run | Repo | `--ids` | PR title (retitle to) | Cuts |
| --- | --- | --- | --- | --- |
| 1 | claude-agents-dashboard | `227` | `test(deps): accept any exact release-kit tag` | none |
| 2 | release-kit | `3,4,5,6,7` | `feat(releases): bounded reader, memoised reader and bump-consumers workflow` | `v1.2.0` |
| 3 | ui-kit | `1` | `chore: scaffold ui-kit` | none |
| 4 | release-kit | `8` | `ci(bump): add ui-kit as a consumer` | none |
| 5 | ui-kit | `2,3,4,5,6,7,8,9,10` | `feat(releases): version chip and What's new drawer` | `v0.2.0` |
| 6 | guide-manager | `38,39,40` | `refactor(releases): use release-kit's reader and ui-kit's drawer` | none |
| 7 | backlog-manager | `297,298,299` | `refactor(releases): use release-kit's reader and ui-kit's drawer` | none |
| 8 | claude-agents-dashboard | `228,229,230` | `fix(releases): use release-kit's reader and ui-kit's drawer` | dashboard patch |

Runs 1 and 2 may run at the same time; run 1's PR must **merge** before run 2's does. Runs 4 and 5 may run at the same time. Runs 6–8 touch separate repos
and could overlap, but the spec orders them guide-manager → backlog-manager → dashboard so a problem found in one is fixed before the next; keep that order
unless you choose otherwise.

## Gates (user steps, between runs)

1. **Before run 2's PR merges:** run 1's PR merged. Create the fine-grained PAT (Contents, Pull requests, Issues — read/write — on the three app repos) and
   add it as `BUMP_TOKEN` in release-kit.
2. **After run 2's PR merges:** CI green → move `v1` to `v1.2.0` (release-kit README §Moving `v1`) → check the three `chore(deps): bump release-kit to v1.2.0`
   PRs opened and are green → merge them (each app: refresh its dev stack's `node_modules`).
3. **Before run 3:** create public repo `futin/ui-kit`, and add ui-kit to the PAT — done except the PAT.
4. **After run 3's PR merges:** read contexts (`ci / checks`, `ci / pr-title`, `ci / skills`) → `apply-repo-settings.sh futin/ui-kit --dry-run`, then for
   real → add `BUMP_TOKEN` to ui-kit → tag baseline `v0.1.0` on the merge commit → dispatch `release.yml` with that sha.
5. **After run 5's PR merges:** `v0.2.0` cut. The three `chore(deps): bump ui-kit to v0.2.0` PRs are **not** opened (the apps do not depend on ui-kit yet,
   so the job ends green with warnings) — expected.
6. **Before runs 6–8:** that app's release-kit bump PR (gate 2) merged. **After each:** merge its PR; run the `## After merge` step its run summary names.

## Known snags

- `run3-ui-kit-01`'s `## Done when` names `npm test` and friends, which do not exist on ui-kit's empty `main` until the item creates them. The pre-flight may
  read it `needs-answers`; answer "the item creates these scripts", or start that run with `--question-mode decide`.
- `run5-ui-kit-09` (playground) is verified headless by a `vite build` smoke only; look at `npm run dev` yourself before merging run 5's PR.
- `run8-dashboard-04` re-shoots Playwright baselines in a worktree; review the snapshot diffs in the PR before merging.

## Titles

| File | Title | Issue |
| --- | --- | --- |
| `run1-dashboard-01-pin-check.md` | Accept any exact release-kit tag in the pin check | [claude-agents-dashboard#227](https://github.com/futin/claude-agents-dashboard/issues/227) |
| `run2-release-kit-01-git-port.md` | Bound the releases reader and take a git port | [release-kit#3](https://github.com/futin/release-kit/issues/3) |
| `run2-release-kit-02-memoised-reader.md` | Memoised releases reader and findRepoRoot | [release-kit#4](https://github.com/futin/release-kit/issues/4) |
| `run2-release-kit-03-node10-types.md` | Resolve types under moduleResolution node | [release-kit#5](https://github.com/futin/release-kit/issues/5) |
| `run2-release-kit-04-bump-script.md` | Bump-consumer script | [release-kit#6](https://github.com/futin/release-kit/issues/6) |
| `run2-release-kit-05-bump-workflow.md` | Reusable bump-consumers workflow and self.yml bump job | [release-kit#7](https://github.com/futin/release-kit/issues/7) |
| `run3-ui-kit-01-scaffold.md` | Scaffold ui-kit | [ui-kit#1](https://github.com/futin/ui-kit/issues/1) |
| `run4-release-kit-06-ui-kit-consumer.md` | Add ui-kit as a bump consumer | [release-kit#8](https://github.com/futin/release-kit/issues/8) |
| `run5-ui-kit-02-types-fixtures.md` | Releases wire types and fixtures | [ui-kit#2](https://github.com/futin/ui-kit/issues/2) |
| `run5-ui-kit-03-pure-logic.md` | Releases pure logic | [ui-kit#3](https://github.com/futin/ui-kit/issues/3) |
| `run5-ui-kit-04-notes-renderer.md` | Release notes renderer | [ui-kit#4](https://github.com/futin/ui-kit/issues/4) |
| `run5-ui-kit-05-hooks.md` | useReleases and useWhatsNew hooks | [ui-kit#5](https://github.com/futin/ui-kit/issues/5) |
| `run5-ui-kit-06-drawer.md` | Drawer shell | [ui-kit#6](https://github.com/futin/ui-kit/issues/6) |
| `run5-ui-kit-07-chip-panel-drawer.md` | Version chip, releases panel and releases drawer | [ui-kit#7](https://github.com/futin/ui-kit/issues/7) |
| `run5-ui-kit-08-stylesheet.md` | Stylesheet and tokens | [ui-kit#8](https://github.com/futin/ui-kit/issues/8) |
| `run5-ui-kit-09-playground.md` | Playground: fixtures under three themes | [ui-kit#9](https://github.com/futin/ui-kit/issues/9) |
| `run5-ui-kit-10-packaging.md` | Packaging smoke and consuming docs | [ui-kit#10](https://github.com/futin/ui-kit/issues/10) |
| `run6-guide-manager-01-server.md` | Releases service on release-kit's reader | [guide-manager#38](https://github.com/futin/guide-manager/issues/38) |
| `run6-guide-manager-02-client.md` | Releases chip and drawer from ui-kit | [guide-manager#39](https://github.com/futin/guide-manager/issues/39) |
| `run6-guide-manager-03-css-docs.md` | ui-kit token mapping, dead releases CSS and docs | [guide-manager#40](https://github.com/futin/guide-manager/issues/40) |
| `run7-backlog-manager-01-server.md` | Releases service on release-kit's reader | [backlog-manager#297](https://github.com/futin/backlog-manager/issues/297) |
| `run7-backlog-manager-02-client.md` | Releases chip and drawer from ui-kit | [backlog-manager#298](https://github.com/futin/backlog-manager/issues/298) |
| `run7-backlog-manager-03-css-docs.md` | ui-kit token mapping, dead releases CSS and docs | [backlog-manager#299](https://github.com/futin/backlog-manager/issues/299) |
| `run8-dashboard-02-server.md` | Releases read on release-kit's reader | [claude-agents-dashboard#228](https://github.com/futin/claude-agents-dashboard/issues/228) |
| `run8-dashboard-03-client.md` | Releases chip and drawer from ui-kit | [claude-agents-dashboard#229](https://github.com/futin/claude-agents-dashboard/issues/229) |
| `run8-dashboard-04-css-docs.md` | ui-kit token mapping, dead releases CSS and visual baselines | [claude-agents-dashboard#230](https://github.com/futin/claude-agents-dashboard/issues/230) |
