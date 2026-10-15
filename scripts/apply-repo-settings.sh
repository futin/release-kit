#!/usr/bin/env bash
# Apply release-kit's merge settings and the `main-pr-only` ruleset to one GitHub repo. Idempotent: the ruleset is found by name and updated in place,
# never duplicated. Run it only after one PR has reported the three `ci / …` contexts — a required context that never reports locks `main` (README).
#
# Usage: apply-repo-settings.sh <owner/repo> [--dry-run]
set -euo pipefail

usage() { echo "usage: apply-repo-settings.sh <owner/repo> [--dry-run]" >&2; exit 2; }

repo=""
dry=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) dry=1 ;;
    -*) usage ;;
    *) [ -z "$repo" ] || usage; repo=$arg ;;
  esac
done
[ -n "$repo" ] || usage
command -v gh >/dev/null 2>&1 || { echo "gh (GitHub CLI) is not on PATH" >&2; exit 2; }

here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
ruleset="$here/../rulesets/main.json"
ruleset="$(cd "$(dirname "$ruleset")" && pwd)/$(basename "$ruleset")"
name="main-pr-only"

# Booleans go through -F (typed); -f would send the string "true", which the API rejects.
settings=(
  -F allow_squash_merge=true
  -F allow_merge_commit=false
  -F allow_rebase_merge=false
  -F delete_branch_on_merge=true
  -f squash_merge_commit_title=PR_TITLE
  -f squash_merge_commit_message=PR_BODY
)

write() {
  if [ "$dry" -eq 1 ]; then
    echo "would run: gh $*"
  else
    gh "$@" >/dev/null
    echo "ran: gh $*"
  fi
}

write api -X PATCH "repos/$repo" "${settings[@]}"

existing=$(gh api "repos/$repo/rulesets" | node -e '
  let s = ""; process.stdin.on("data", d => (s += d)).on("end", () => {
    const hit = JSON.parse(s || "[]").find(r => r.name === process.argv[1]);
    process.stdout.write(hit ? String(hit.id) : "");
  });' "$name")

if [ -n "$existing" ]; then
  write api -X PUT "repos/$repo/rulesets/$existing" --input "$ruleset"
else
  write api -X POST "repos/$repo/rulesets" --input "$ruleset"
fi
