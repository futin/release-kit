#!/usr/bin/env bash
# Stand-in for `gh` in tests: logs each call's argv as one line, answers the rulesets list from $FAKE_GH_RULESETS, everything else with {}.
printf '%s\n' "$*" >> "$FAKE_GH_LOG"
if [ "$1" = "api" ] && [[ "$*" != *"-X"* ]] && [[ "$2" == */rulesets ]]; then
  printf '%s\n' "${FAKE_GH_RULESETS:-[]}"
else
  printf '{}\n'
fi
