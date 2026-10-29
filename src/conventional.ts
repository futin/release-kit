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

/**
 * The opt-in notes rule: a PR whose title cuts a release (feat|fix|perf) needs a non-empty `## What's new` section, or `None` to opt out. Other types and
 * titles `checkTitle` already refuses pass here, so a bad title is reported once, by the title check.
 */
export function checkNotes(title: string, body: string | null): { ok: boolean; reason?: string } {
  const t = checkTitle(title);
  if (!t.ok || !t.type || !RELEASE_TYPES.includes(t.type)) return { ok: true };
  if (extractWhatsNew(body) !== '') return { ok: true };
  return { ok: false, reason: `a ${t.type} PR cuts a release and needs a "## What's new" section with notes for the release, or "None" to opt out` };
}

export type TagFields = { title: string; pr: number; notes: string; type: ReleaseType; scope?: string; breaking: boolean };
/** One PR inside a parsed tag. `title` is set on a per-PR tag's item (the full PR title) and on a rollup's title-only item (its prefix stripped). */
export type ParsedItem = { pr: number; type: ReleaseType; scope?: string; breaking: boolean; title?: string; notes: string };
/** `items` is empty for the baseline tag, one item for a per-PR tag, and every rolled-up PR in body order for a rollup tag. */
export type ParsedTag = {
  subject: string;
  title: string;
  type: ReleaseType | 'baseline';
  scope?: string;
  pr?: number;
  breaking: boolean;
  notes: string;
  items: ParsedItem[];
};
/** One PR going into a rollup tag; `title` is the full PR title, `notes` its release notes or empty. */
export type RollupItem = { pr: number; title: string; type: ReleaseType; scope?: string; breaking: boolean; notes: string };

/** The annotated-tag message the release workflow writes and the reader parses (spec §Tag message — the contract). */
export function formatTagMessage(r: TagFields): string {
  const trailers = [`Release-Type: ${r.type}`];
  if (r.scope) trailers.push(`Release-Scope: ${r.scope}`);
  trailers.push(`Release-PR: ${r.pr}`);
  if (r.breaking) trailers.push('Release-Breaking: true');
  return `${r.title} (#${r.pr})\n\n${r.notes ? `${r.notes}\n\n` : ''}${trailers.join('\n')}\n`;
}

const cap = (scope: string): string => scope.charAt(0).toUpperCase() + scope.slice(1);
const heading = (scope: string | undefined): string => `### ${scope ? cap(scope) : 'Other'}`;
const marker = (pr: number): string => ` (#${pr})`;
const PREFIX = /^[a-z]+(?:\([^)]*\))?!?: /;

// A line-ending `(#N)` for the item's own PR is stripped from every line: the reader ends an item at the first line ending its marker, so one left
// mid-notes would cut the item short, and one left on the last line would double the marker the formatter appends.
function withoutOwnMarker(pr: number, s: string): string {
  const own = new RegExp(`(?:(?:^|[ \\t]+)\\(#${pr}\\))+[ \\t]*$`);
  return lf(s).split('\n').map((l) => l.replace(own, '')).join('\n').trim();
}

/**
 * The annotated-tag message of a rollup release: many PRs, oldest first, under one tag (plan §Wire format). The body groups items by scope under `###`
 * headings, so the tag must be written with `--cleanup=verbatim` or git strips them as comments. The trailer block never carries `Release-PR` or
 * `Release-Scope`, which is what makes a v1.3.0 reader show the rollup as one release with the grouped body as its notes.
 */
export function formatRollupMessage(items: RollupItem[]): string {
  if (items.length === 0) throw new Error('a rollup needs at least one item');
  const scopes = [...new Set(items.flatMap((i) => (i.scope ? [i.scope] : [])))];
  const groups = [...scopes, undefined].map((s) => items.filter((i) => i.scope === s)).filter((g) => g.length > 0);
  const n = items.length;
  const count = `${n} ${n === 1 ? 'change' : 'changes'}`;
  const subject = scopes.length ? `${scopes.map(cap).join(', ')} — ${count}` : count;
  const entries: string[] = [];
  const body = groups.map((g) => {
    const texts = g.map((i) => {
      const notes = withoutOwnMarker(i.pr, i.notes);
      entries.push(`${notes ? '' : '~'}${i.pr}:${i.type}${i.breaking ? '!' : ''}${i.scope ? `:${i.scope}` : ''}`);
      return `${notes || withoutOwnMarker(i.pr, i.title.replace(PREFIX, ''))}${marker(i.pr)}`;
    });
    return [heading(g[0].scope), ...texts].join('\n\n');
  });
  // RELEASE_TYPES is in rank order, so the first type any item has is the highest; breaking only adds its own trailer.
  const trailers = [`Release-Type: ${RELEASE_TYPES.find((t) => items.some((i) => i.type === t))}`];
  if (items.some((i) => i.breaking)) trailers.push('Release-Breaking: true');
  trailers.push(`Release-Items: ${entries.join(', ')}`);
  return `${subject}\n\n${body.join('\n\n')}\n\n${trailers.join('\n')}\n`;
}

const TRAILER = /^([A-Za-z][A-Za-z0-9-]*): (.*)$/;

const ITEM_ENTRY = /^(~)?(\d+):(feat|fix|perf)(!)?(?::([a-z0-9-]+))?$/;

// Walks a rollup body back into its items. Group headings sit only where the scope changes between consecutive `Release-Items` entries, so the reader
// skips exactly those lines and an item's own `###` heading stays in its notes. An item ends at the first line ending its own marker, which the
// formatter stripped from everywhere else in the item. A malformed entry yields no items; a missing marker stops the walk with the items found so far.
function parseRollupItems(list: string, body: string[]): ParsedItem[] {
  const entries = list.split(',').map((e) => ITEM_ENTRY.exec(e.trim()));
  if (entries.some((m) => !m)) return [];
  const items: ParsedItem[] = [];
  let at = 0;
  const skipBlank = (): void => {
    while (at < body.length && body[at].trim() === '') at++;
  };
  let prevScope: string | undefined | null = null;
  for (const m of entries as RegExpExecArray[]) {
    const [, titleOnly, pr, type, bang, scope] = m;
    if (scope !== prevScope) {
      skipBlank();
      if (body[at]?.trimEnd() === heading(scope)) at++;
      prevScope = scope;
    }
    skipBlank();
    const end = marker(Number(pr));
    const start = at;
    while (at < body.length && !body[at].trimEnd().endsWith(end)) at++;
    if (at === body.length) break;
    const last = body[at].trimEnd();
    const text = [...body.slice(start, at), last.slice(0, -end.length)].join('\n').trim();
    at++;
    const item: ParsedItem = { pr: Number(pr), type: type as ReleaseType, breaking: bang === '!', notes: titleOnly ? '' : text };
    if (scope) item.scope = scope;
    if (titleOnly) item.title = text;
    items.push(item);
  }
  return items;
}

/**
 * Inverse of {@link formatTagMessage} and {@link formatRollupMessage}. A message without a `Release-Type` trailer block (the baseline tag) parses as type
 * `baseline`. `title` and `notes` are the subject and pre-trailer body for every kind of tag; `items` is parsed in addition.
 */
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
    return { subject, title, type: 'baseline', breaking: false, notes: body.join('\n').trim(), items: [] };
  }
  const pr = trailers.get('Release-PR');
  const out: ParsedTag = {
    subject,
    title,
    type: type as ReleaseType,
    breaking: trailers.get('Release-Breaking') === 'true',
    notes: body.slice(0, Math.max(blank, 0)).join('\n').trim(),
    items: [],
  };
  const scope = trailers.get('Release-Scope');
  if (scope) out.scope = scope;
  if (pr && /^\d+$/.test(pr)) out.pr = Number(pr);
  const list = trailers.get('Release-Items');
  if (list !== undefined) {
    out.items = parseRollupItems(list, body.slice(0, Math.max(blank, 0)));
  } else if (out.pr !== undefined) {
    const item: ParsedItem = { pr: out.pr, type: out.type as ReleaseType, breaking: out.breaking, title, notes: out.notes };
    if (scope) item.scope = scope;
    out.items = [item];
  }
  return out;
}
