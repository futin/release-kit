# release-kit

Shared CI and release parts for futin's Node apps: a reusable PR gate (`ci-node.yml`), a Conventional Commits PR-title checker, a reusable release workflow
(`release.yml`) with the reader for the releases it cuts, and the ruleset plus merge settings that make `main` PR-only. Design: `claude-agents-dashboard`
`docs/superpowers/specs/2026-10-15-release-pipeline-design.md`.

| Path | What it is |
|---|---|
| `.github/workflows/ci-node.yml` | reusable workflow: jobs `checks`, `pr-title`, `skills` |
| `.github/workflows/release.yml` | reusable workflow: job `release` tags and publishes every unreleased `feat\|fix\|perf` PR on `main` |
| `.github/workflows/self.yml` | this repo's own CI and releases, through `ci-node.yml` and `release.yml` |
| `scripts/pr-title.mjs` | the CLI wrapper for the title rule (which lives in `src/conventional.ts`); reads `PR_TITLE` from the environment, exit 1 with the reason on a bad title |
| `rulesets/main.json` | the `main-pr-only` ruleset |
| `scripts/apply-repo-settings.sh` | squash-only merge settings + create-or-update the ruleset; `--dry-run` prints the `gh` calls |
| `src/release-cli.ts` | the `gh` adapter `release.yml` runs (`dist/esm/release-cli.js`): reads `TARGET_SHA`, `GITHUB_REPOSITORY`, `GH_TOKEN` from the environment |
| `src/release.ts`, `src/conventional.ts`, `src/git.ts` | the release engine, the title/bump/tag-message rules and the one git launcher |
| `src/read-releases.ts`, `src/releases-json.ts` | the reader for a Node backend (`readReleases`) and its build-time fallback that writes the same JSON to a file |
| `dist/` | committed build output (esm + `.d.ts` + cjs); `npm run build` regenerates it and `test/dist-drift.test.ts` fails when it is stale |

`npm test` runs the tests (Node ≥ 22; the workflow tests need `python3` with PyYAML and skip without it). `npm run build` rebuilds `dist/`.

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

## Adopting releases

Once an app is gated (above), releases need four things: a caller workflow, a `## What's new` section in the PR template, one baseline tag, and — only if
the app shows them — the reader.

1. Add `.github/workflows/release.yml`:

   ```yaml
   name: release
   on:
     push:
       branches: [main]
     workflow_dispatch:
       inputs:
         sha:
           description: The commit to release up to (a re-run of a missed or failed release)
           required: false
           default: ''
   permissions:
     contents: write
     pull-requests: read
   concurrency:
     group: release
     cancel-in-progress: false
   jobs:
     release:
       uses: futin/release-kit/.github/workflows/release.yml@v1
       with:
         sha: ${{ inputs.sha }}
         kit-ref: v1
   ```

   Both permissions are required: setting `contents` alone drops `pull-requests` to none, and the PR lookup then fails on a private repo. Keep `kit-ref`
   equal to the `@` ref in `uses:`. `cancel-in-progress` stays `false` in an app: GitHub still drops an older *pending* run when a newer one queues, which
   is why a run releases the whole range since the last tag and not just its own commit.
2. Put a `## What's new` section directly above `## Why this shape` in `.github/pull_request_template.md`, with its hint inside an HTML comment:

   ```markdown
   ## What's new

   <!-- 1–3 lines in user terms: what someone using the app can now do. Delete this section for PRs with nothing user-visible. -->
   ```

   The release notes are that section only, up to the next `## ` heading; a missing or empty one means the title alone is the entry.
3. Tag the baseline once, on the `main` commit that contains the release workflow. Until a version tag exists the workflow releases nothing and ends green
   with the warning `no baseline tag — see Baseline`:

   ```bash
   git tag -a v0.1.0 <sha> -m "Baseline — versioning starts here" --cleanup=verbatim
   ```

   ```bash
   git push origin v0.1.0
   ```

   The tag is the source of truth for the version; `package.json` `version` is not read. The baseline's GitHub Release is created by re-running the
   workflow (below).

### What cuts a release

The PR title decides; the version is bumped from the newest `vX.Y.Z` tag reachable from the commit.

| Title | While major = 0 | From 1.0.0 |
|---|---|---|
| `feat` | minor | minor |
| `fix`, `perf` | patch | patch |
| `!` after type or scope, or a `BREAKING CHANGE: ` line in the PR body | minor | major |

Any other type (`docs`, `chore`, `test`, `refactor`, `ci`, `build`) cuts nothing, and a `BREAKING CHANGE:` line on one of them is ignored. A commit on `main`
with no PR is skipped with the warning `no PR for <sha>` and does not block the commits after it.

### Re-running

`workflow_dispatch` with a `sha` re-runs the release for that commit and every unreleased commit before it; with no `sha` it uses the branch head. It is
idempotent: a commit that already has its tag and its Release is left alone, and a tag whose Release is missing only gets the Release. This is also how the
baseline gets its GitHub Release. A dispatch whose commit has a later version tag fails with `a newer release exists: <tag>`, because versions are never
assigned out of order; on a push run the same condition ends green, since it can only be a re-run of a superseded run. The `sha` must be a commit on the
default branch: any other commit fails with `target <sha> is not on origin/<default branch>`, with nothing tagged.

### Reading releases from a server

The package's `exports` is the whole surface (esm, cjs and `.d.ts`), so a Node backend depends on a tag and builds one reader for its own checkout:

```bash
pnpm add github:futin/release-kit#v1.2.0
```

```ts
import { createReleasesReader, findRepoRoot } from 'release-kit';

const releases = createReleasesReader({ root: findRepoRoot(process.cwd()) ?? process.cwd() });
const { current, releases: list } = await releases.read(); // { version, ahead } | null, newest first; never rejects
```

`read()` is memoised. Its key is the root, `HEAD`, and the mtimes of `packed-refs` and `refs/tags` under the common git dir, so a commit, a new tag or a
`git pack-refs` re-reads, and a linked worktree sees the main checkout's tags. Only a complete answer is kept (a checkout with no version tags is complete);
concurrent calls under one key share one read. `root` may be a function, read on every call and answering a path or `null` (the empty shape, no git run),
so an env seam such as `() => process.env.MY_RELEASES_ROOT ?? findRepoRoot(process.cwd())` keeps working. `findRepoRoot(from)` is the first ancestor holding
a `.git` entry, directory or file.

Every git read is killed after `timeoutMs` (default `10_000`). An app with its own git runner passes it as `git`, a `GitPort` that answers stdout or `null`
for any failure; that port carries its own bound and also runs the key's `rev-parse`:

```ts
const releases = createReleasesReader({ root, git: myPort }); // or { root, timeoutMs: 5_000 }, or a wrapper around defaultGitPort()
```

There is no HTTP code in the kit; each app mounts `read()` in its own framework:

```ts
@Get('releases') releases() { return reader.read(); } // Nest
if (req.url === '/api/releases') return void reader.read().then((r) => res.end(JSON.stringify(r))); // raw node:http
```

The reader reads the local annotated version tags, so the checkout needs its tags. `dist/esm/releases-json.js <outFile> [repoRoot]` writes the same JSON to
a file for a build step, for an install that has no `.git`. Underneath, `readReleases(root, opts?)` answers once without a memo, and
`readReleasesResult(root, opts?)` answers `{ value, complete }`: `complete` is false when the tag read failed, or when releases exist but no tag is reachable
from `HEAD`.

## Moving `v1`

Apps pin `@v1`, a lightweight tag that floats. The `vX.Y.Z` tags are cut by the `release` job (`self.yml`) when a `feat|fix|perf` PR merges, so do not tag
them by hand. Only moving `v1` stays manual: once the run is green, point `v1` at the new version:

```bash
git fetch --tags && git tag -f v1 vX.Y.Z
```

```bash
git push -f origin v1
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
