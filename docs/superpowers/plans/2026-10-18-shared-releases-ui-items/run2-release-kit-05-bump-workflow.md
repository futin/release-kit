## Goal

A reusable `bump-consumers.yml` workflow runs the bump script for every consumer after a release, and release-kit's own `self.yml` calls it for the three apps.
Docs explain bump PRs. Spec D8, D10–D12 and Part 1 §Bump workflow.

Source: plan Task B5 and the bump half of Task B6 in `docs/superpowers/plans/2026-10-18-shared-releases-ui.md`, spec
`docs/superpowers/specs/2026-10-18-shared-releases-ui-design.md`. The plan gives behaviour and test cases, never literal code; where the code disagrees, follow
the code and say so in your report.

Constraints: no `${{ }}` inside any `run:` carries `inputs.*`, PR or event text (env or argv only). `npm run build` before `npm test`; `dist/` committed.
Prose wraps at 160 columns.

## Plan

Files: create `.github/workflows/bump-consumers.yml`; modify `.github/workflows/self.yml`, `README.md`; extend `test/workflows.test.mjs` (PyYAML-gated like the
rest).

Consumes the previous item's CLI env contract. Produces `workflow_call` inputs `package`, `repository`, `consumers`, `kit-ref` (default `v1`), secret `token`.

1. Write the failing guard tests below. `npm test`: fail.
2. Implement both workflow files. `npm test`: pass.
3. README: new §Bump PRs (what opens one; how to decline one: close it; the `BUMP_TOKEN` scopes; the consumer list; "Re-run jobs" as the recovery).
4. `npm run build && npm test && npm run typecheck` pass (dist-drift green). Commit `feat(bump): reusable bump-consumers workflow`.

## Test cases

- Inputs are exactly those four, `kit-ref` default `v1`; `token` is a required secret.
- A `version` job checks the caller out with `fetch-depth: 0` (and release-kit at `inputs.kit-ref` into `.release-kit`, since it runs kit code), and outputs
  the newest annotated `vX.Y.Z` as `version` and the full newest-first list as `versions`, ordered as `readReleases` orders them. No version → `::warning::`
  and the matrix is skipped.
- The step running `bump-consumer.mjs` has exactly the env `PKG`, `REPOSITORY`, `CONSUMER` (inputs/matrix), `VERSION` and `VERSIONS`
  (`needs.version.outputs.version` / `.versions`), `GH_TOKEN` (`secrets.token`).
- `bump-consumers.yml` joins the fixed file lists of the existing "no job sets `name:`" and `setup-node` cache guards.
- The matrix over `consumers` has `fail-fast: false`; checks release-kit out at `inputs.kit-ref` into `.release-kit`; `setup-node@v5` has
  `package-manager-cache: false`; `COREPACK_ENABLE_DOWNLOAD_PROMPT: '0'` in env.
- No `run:` contains `${{ inputs.` or `${{ github.event`. `secrets.token` appears only under `env:` of steps running `git`, `gh` or the script, so the consumer
  is cloned in a `run:` step (`gh repo clone` with `GH_TOKEN` in env), not by `actions/checkout` `with: token:`.
- `self.yml` has job `bump` with `needs: release`, `if: github.event_name == 'push'`, `uses: ./.github/workflows/bump-consumers.yml`,
  `kit-ref: ${{ github.ref_name }}`, consumers exactly `futin/claude-agents-dashboard`, `futin/backlog-manager`, `futin/guide-manager`, secret from
  `secrets.BUMP_TOKEN`.

## Done when

- `npm run build` leaves `git status --porcelain dist` empty after the commit.
- `npm test` passes.
- `npm run typecheck` passes.
