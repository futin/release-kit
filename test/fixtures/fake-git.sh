#!/usr/bin/env bash
# Stands in for a git that hangs. Bash runs a TERM trap only between foreground commands, so the sleep runs in the background and the shell waits on it:
# the trap then fires at once, and killing the sleep closes the stdout pipe it inherited, which is what lets execFile's callback run.
trap 'kill "$pid" 2>/dev/null; exit 143' TERM
sleep 30 &
pid=$!
wait "$pid"
