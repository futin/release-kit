// The PR-title rule every app's `pr-title` check enforces, and the parse the release workflow reads the bump from. `!` is allowed only on a type that
// cuts a release: a breaking `chore!` would be a release type no reader or badge can show (spec §Phase C, step 3).

const RELEASING = /^(feat|fix|perf)(?:\(([a-z0-9-]+)\))?(!)?: (.+)$/;
const SILENT = /^(docs|chore|test|refactor|ci|build)(?:\(([a-z0-9-]+)\))?: (.+)$/;
const SILENT_BREAKING = /^(docs|chore|test|refactor|ci|build)(?:\([a-z0-9-]+\))?!: /;

const RULE = 'expected "<type>(<scope>)?: <description>" with type feat|fix|perf|docs|chore|test|refactor|ci|build and a lowercase scope';

export type TitleCheck = { ok: boolean; type?: string; scope?: string; breaking: boolean; reason?: string };

/** Parse a PR title against the release-kit title rule. */
export function checkTitle(title: string): TitleCheck {
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
function described(description: string): TitleCheck | null {
  return description.trim() === '' ? { ok: false, breaking: false, reason: 'the description after ": " is empty' } : null;
}
