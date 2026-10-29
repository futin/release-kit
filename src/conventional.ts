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

export type ReleaseType = 'feat' | 'fix' | 'perf';

export const RELEASE_TYPES: readonly string[] = ['feat', 'fix', 'perf'];

// PR bodies edited in the GitHub web UI arrive with CRLF; every parser below works on LF only.
const lf = (s: string): string => s.replace(/\r\n/g, '\n');

/** True for a `!` title or a body line starting `BREAKING CHANGE: `. */
export function isBreaking(check: TitleCheck, body: string | null): boolean {
  return check.breaking || /^BREAKING CHANGE: /m.test(lf(body ?? ''));
}

/** Parse `1.2.3` or `v1.2.3`; anything else (a prerelease suffix, a short version) is null. */
export function parseVersion(v: string): [number, number, number] | null {
  const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(v);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** The version after `base`, without a leading `v`. Below 1.0.0 a breaking change bumps the minor, not the major. */
export function nextVersion(base: string, type: ReleaseType, breaking: boolean): string {
  const v = parseVersion(base);
  if (!v) throw new Error(`cannot bump ${JSON.stringify(base)}: expected X.Y.Z or vX.Y.Z`);
  const [major, minor, patch] = v;
  if (breaking) return major === 0 ? `0.${minor + 1}.0` : `${major + 1}.0.0`;
  return type === 'feat' ? `${major}.${minor + 1}.0` : `${major}.${minor}.${patch + 1}`;
}

/**
 * The content of a PR body's `## What's new` section, without its heading. Comments are stripped first: the template's optional sections are commented-out
 * blocks that themselves contain `## ` headings, and a commented section must count as absent. Deeper headings (`###`) stay inside the notes.
 */
export function extractWhatsNew(body: string | null): string {
  if (!body) return '';
  const lines = lf(body).replace(/<!--[\s\S]*?-->/g, '').split('\n');
  const start = lines.findIndex((l) => l.trimEnd() === "## What's new");
  if (start < 0) return '';
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => l.startsWith('## ') || l.startsWith('🤖 Generated with'));
  return (end < 0 ? rest : rest.slice(0, end)).join('\n').replace(/^\n+/, '').trimEnd();
}

/** True when a What's new section is the author's explicit opt-out: `None`, optionally followed by a dash and a reason. */
export function isNoneOptOut(notes: string): boolean {
  return /^None(\s+[—-]\s+.+)?$/i.test(notes.trim());
}

/** The notes a release carries for a PR body: its What's new section, or nothing when the author opted out with `None`. */
export function releaseNotes(body: string | null): string {
  const notes = extractWhatsNew(body);
  return isNoneOptOut(notes) ? '' : notes;
}

export type TagFields = { title: string; pr: number; notes: string; type: ReleaseType; scope?: string; breaking: boolean };
export type ParsedTag = { subject: string; title: string; type: ReleaseType | 'baseline'; scope?: string; pr?: number; breaking: boolean; notes: string };

/** The annotated-tag message the release workflow writes and the reader parses (spec §Tag message — the contract). */
export function formatTagMessage(r: TagFields): string {
  const trailers = [`Release-Type: ${r.type}`];
  if (r.scope) trailers.push(`Release-Scope: ${r.scope}`);
  trailers.push(`Release-PR: ${r.pr}`);
  if (r.breaking) trailers.push('Release-Breaking: true');
  return `${r.title} (#${r.pr})\n\n${r.notes ? `${r.notes}\n\n` : ''}${trailers.join('\n')}\n`;
}

const TRAILER = /^([A-Za-z][A-Za-z0-9-]*): (.*)$/;

/** Inverse of {@link formatTagMessage}. A message without a `Release-Type` trailer block (the baseline tag) parses as type `baseline`. */
export function parseTagMessage(msg: string): ParsedTag {
  const lines = lf(msg).trimEnd().split('\n');
  const subject = lines[0] ?? '';
  const title = subject.replace(/ \(#\d+\)$/, '');
  const body = lines.slice(1);
  const blank = body.lastIndexOf('');
  // Only the final paragraph can be trailers, so a notes paragraph that ends in `Note: see #12` stays notes.
  const last = body.slice(blank + 1);
  const trailers = new Map<string, string>();
  for (const l of last) {
    const m = TRAILER.exec(l);
    if (m) trailers.set(m[1], m[2]);
  }
  const type = trailers.get('Release-Type');
  if (last.length === 0 || trailers.size !== last.length || !type || !RELEASE_TYPES.includes(type)) {
    return { subject, title, type: 'baseline', breaking: false, notes: body.join('\n').trim() };
  }
  const pr = trailers.get('Release-PR');
  const out: ParsedTag = {
    subject,
    title,
    type: type as ReleaseType,
    breaking: trailers.get('Release-Breaking') === 'true',
    notes: body.slice(0, Math.max(blank, 0)).join('\n').trim(),
  };
  const scope = trailers.get('Release-Scope');
  if (scope) out.scope = scope;
  if (pr && /^\d+$/.test(pr)) out.pr = Number(pr);
  return out;
}
