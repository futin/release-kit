#!/usr/bin/env node
// CLI for the PR-title rule every app's `pr-title` check enforces; the rule itself lives in src/conventional.ts.
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// The CLI runs from a bare checkout of the kit with no install, so it may import only committed dist/.
import { checkTitle } from '../dist/esm/conventional.js';

export { checkTitle };

function isMain() {
  try {
    return realpathSync(process.argv[1] ?? '') === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isMain()) {
  // The title arrives through the environment, never the command line: the workflow must not interpolate it into a shell (script injection).
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
}
