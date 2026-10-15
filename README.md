# release-kit

Shared CI and release parts for futin's Node apps: a reusable PR gate (`ci-node.yml`), a Conventional Commits PR-title checker, and the ruleset plus
merge settings that make `main` PR-only. Design: `claude-agents-dashboard` `docs/superpowers/specs/2026-10-15-release-pipeline-design.md`.

| Path | What it is |
|---|---|
| `.github/workflows/ci-node.yml` | reusable workflow: jobs `checks`, `pr-title`, `skills` |
| `.github/workflows/self.yml` | this repo's own CI, through `ci-node.yml` |
| `scripts/pr-title.mjs` | the title rule; reads `PR_TITLE` from the environment, exit 1 with the reason on a bad title |
| `rulesets/main.json` | the `main-pr-only` ruleset |
| `scripts/apply-repo-settings.sh` | squash-only merge settings + create-or-update the ruleset; `--dry-run` prints the `gh` calls |

`node --test 'test/**/*.test.mjs'` runs the tests (Node ≥ 22; the workflow tests need `python3` with PyYAML and skip without it).

## Adopting it in an app

1. Add `.github/workflows/ci.yml`:

   ```yaml
   name: ci
   on:
     pull_request:
       types: [opened, synchronize, reopened, edited]
       branches: [main]
     push:
       branches: [main]
   permissions:
     contents: read
   concurrency:
     group: ci-${{ github.event.pull_request.number || github.ref }}
     cancel-in-progress: true
   jobs:
     ci:
       uses: futin/release-kit/.github/workflows/ci-node.yml@v1
       with:
         check-commands: |
           pnpm typecheck
           pnpm test
   ```

   The job id **must** be `ci` and no job may set `name:`. Optional inputs: `node-version` (default `22`), `install-command` (overrides lockfile
   detection: `pnpm-lock.yaml` → `pnpm install --frozen-lockfile`, `package-lock.json` → `npm ci`, neither → skipped), `skills-command` +
   `skills-paths` (an extra suite run only when a PR touches those paths), `kit-ref` (keep it equal to the `@` ref in `uses:`).
2. Open a PR with it and get it green.
3. Read the context names off that PR: `gh pr checks <n>`. They must be exactly `ci / checks`, `ci / pr-title`, `ci / skills`.
4. Only then apply the settings, dry run first:

   ```bash
   scripts/apply-repo-settings.sh <owner>/<repo> --dry-run
   ```

   then the same without `--dry-run`. It is idempotent: a second run updates the ruleset in place.

Applying the ruleset before step 3 risks requiring a context that never reports, which leaves every PR pending — and the ruleset has no bypass.

## Moving `v1`

Apps pin `@v1`, a lightweight tag that floats. Release a compatible change as `vX.Y.Z` and move `v1` to it:

```bash
git tag -a v1.1.0 -m "<what changed>"
```

```bash
git tag -f v1 v1.1.0
```

```bash
git push origin v1.1.0 && git push -f origin v1
```

A breaking change to the inputs or the job names gets `v2`; never move `v1` across one.

## Why

- **Contexts are `ci / <job>`.** A reusable workflow's jobs report as `<caller job id> / <called job id>`. Any `name:` on a job replaces the id in that
  string, and the ruleset would wait for a context that never comes.
- **`checks` and `skills` are never conditioned at job level** — not on the event, not on the action. A skipped job reports success for the head sha. If
  `checks` were skipped on `edited`, a PR whose checks failed could be turned green by editing its title. `pr-title` is the one exception (skipped on
  `push`, where there is no title).
- **The title never enters a `run:` through `${{ }}`.** It reaches the checker only through the `PR_TITLE` environment variable, so a title like
  `` ci: `id` $(id) `` stays text.
