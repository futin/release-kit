#!/usr/bin/env bash
# Stand-in for `gh` in the release CLI tests. Every call is logged as one line of tab-separated argv in $FAKE_GH_DIR/calls.log. Canned answers live in
# $FAKE_GH_DIR: `api <path>` reads the file named by the path with `/` as `_` (`<name>.json` is the body, an existing `<name>.404` makes it a not-found),
# `release view <tag>` succeeds only when `release-<tag>` exists, and `release create` records its notes file as `notes-<tag>` and makes the release exist.
printf '%s\t' "$@" >> "$FAKE_GH_DIR/calls.log"
printf '\n' >> "$FAKE_GH_DIR/calls.log"

case "$1 $2" in
  "api "*)
    name="${2//\//_}"
    if [ -e "$FAKE_GH_DIR/$name.404" ]; then
      echo "gh: Not Found (HTTP 404)" >&2
      exit 1
    fi
    if [ -e "$FAKE_GH_DIR/$name.500" ]; then
      echo "gh: Server Error (HTTP 500)" >&2
      exit 1
    fi
    if [ -e "$FAKE_GH_DIR/$name.json" ]; then cat "$FAKE_GH_DIR/$name.json"; else echo '[]'; fi
    ;;
  "release view")
    if [ -e "$FAKE_GH_DIR/release-$3" ]; then echo "title: $3"; exit 0; fi
    if [ -e "$FAKE_GH_DIR/release-view-broken" ]; then echo "gh: network unreachable" >&2; exit 1; fi
    echo "release not found" >&2
    exit 1
    ;;
  "release create")
    tag="$3"
    while [ $# -gt 0 ]; do
      if [ "$1" = "--notes-file" ]; then cp "$2" "$FAKE_GH_DIR/notes-$tag"; fi
      shift
    done
    touch "$FAKE_GH_DIR/release-$tag"
    ;;
  *)
    echo "fake gh: unexpected call: $*" >&2
    exit 2
    ;;
esac
