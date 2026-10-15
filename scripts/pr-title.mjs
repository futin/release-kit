#!/usr/bin/env node
// The PR-title rule every app's `pr-title` check enforces, and the parse the release workflow reads the bump from. `!` is allowed only on a type that
// cuts a release: a breaking `chore!` would be a release type no reader or badge can show (spec §Phase C, step 3).
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const RELEASING = /^(feat|fix|perf)(?:\(([a-z0-9-]+)\))?(!)?: (.+)$/;
const SILENT = /^(docs|chore|test|refactor|ci|build)(?:\(([a-z0-9-]+)\))?: (.+)$/;
const SILENT_BREAKING = /^(docs|chore|test|refactor|ci|build)(?:\([a-z0-9-]+\))?!: /;

const RULE = 'expected "<type>(<scope>)?: <description>" with type feat|fix|perf|docs|chore|test|refactor|ci|build and a lowercase scope';

/**
 * Parse a PR title against the release-kit title rule.
 * @param {string} title
 * @returns {{ ok: boolean, type?: string, scope?: string, breaking: boolean, reason?: string }}
 */
export function checkTitle(title) {
  const t = String(title ?? '');
  let m = RELEASING.exec(t);
  if (m) return described(m[4]) ?? { ok: true, type: m[1], scope: m[2], breaking: m[3] === '!' };
  m = SILENT.exec(t);
  if (m) return described(m[3]) ?? { ok: true, type: m[1], scope: m[2], breaking: false };
  if (SILENT_BREAKING.test(t)) {
    return { ok: false, breaking: false, reason: `"!" (breaking) is allowed only on feat|fix|perf, which cut a release; got ${JSON.stringify(t)}` };
  }
  return { ok: false, breaking: false, reason: `${RULE}; got ${JSON.stringify(t)}` };
}

// The regex's `.+` accepts a description of spaces only; a title GitHub shows as "feat:" is not a description.
function described(description) {
  return description.trim() === '' ? { ok: false, breaking: false, reason: 'the description after ": " is empty' } : null;
}

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
