#!/usr/bin/env node
// CLI for the PR-title rule every app's `pr-title` check enforces; the rule itself lives in src/conventional.ts.
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// The CLI runs from a bare checkout of the kit with no install, so it may import only committed dist/.
import { checkNotes, checkTitle } from '../dist/esm/conventional.js';

export { checkNotes, checkTitle };

function isMain() {
  try {
    return realpathSync(process.argv[1] ?? '') === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isMain()) {
  // The title and body arrive through the environment, never the command line: the workflow must not interpolate them into a shell (script injection).
  if (process.env.PR_TITLE === undefined) {
    console.error('PR_TITLE is not set; the workflow passes the PR title through env PR_TITLE');
    process.exit(1);
  }
  const r = checkTitle(process.env.PR_TITLE);
  if (r.ok) {
    console.log(`ok: ${r.type}${r.scope ? `(${r.scope})` : ''}${r.breaking ? ' breaking' : ''}`);
  } else {
    console.error(r.reason);
    process.exit(1);
  }
  // Opt-in: a caller that sets require-notes gets the What's new rule too; an unset PR_BODY counts as an empty body.
  if (process.env.REQUIRE_NOTES === 'true') {
    const n = checkNotes(process.env.PR_TITLE, process.env.PR_BODY ?? null);
    if (!n.ok) {
      console.error(n.reason);
      process.exit(1);
    }
  }
}
