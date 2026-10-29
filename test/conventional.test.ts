import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { checkNotes, checkTitle, extractWhatsNew, formatRollupMessage, formatTagMessage, isBreaking, isNoneOptOut, nextVersion, parseTagMessage, parseVersion, releaseNotes } from '../src/index.js';
import type { ParsedTag, ReleaseType, RollupItem } from '../src/index.js';

const bump = (base: string, type: 'feat' | 'fix' | 'perf', breaking: boolean) => nextVersion(base, type, breaking);

test('0.x non-breaking: feat is a minor, fix and perf are a patch', () => {
  assert.equal(bump('0.1.0', 'feat', false), '0.2.0');
  assert.equal(bump('0.1.0', 'fix', false), '0.1.1');
  assert.equal(bump('0.1.0', 'perf', false), '0.1.1');
});

test('0.x breaking: feat and fix are a minor', () => {
  assert.equal(bump('0.4.2', 'feat', true), '0.5.0');
  assert.equal(bump('0.4.2', 'fix', true), '0.5.0');
});

test('1.x non-breaking: feat is a minor, fix and perf are a patch', () => {
  assert.equal(bump('1.4.2', 'feat', false), '1.5.0');
  assert.equal(bump('1.4.2', 'fix', false), '1.4.3');
  assert.equal(bump('1.4.2', 'perf', false), '1.4.3');
});

test('1.x breaking: any type is a major; 0.x perf stays a minor', () => {
  assert.equal(bump('1.4.2', 'feat', true), '2.0.0');
  assert.equal(bump('1.4.2', 'fix', true), '2.0.0');
  assert.equal(bump('1.4.2', 'perf', true), '2.0.0');
  assert.equal(bump('0.4.2', 'perf', true), '0.5.0');
});

test('a v-prefixed base is accepted and the result has no v', () => {
  assert.equal(bump('v0.9.0', 'feat', false), '0.10.0');
});

test('an unparsable base throws', () => {
  assert.throws(() => bump('1.2', 'feat', false));
});

test('parseVersion accepts 1.2.3 and v1.2.3 only', () => {
  assert.deepEqual(parseVersion('1.2.3'), [1, 2, 3]);
  assert.deepEqual(parseVersion('v1.2.3'), [1, 2, 3]);
  for (const bad of ['1.2', 'v1', '1.2.3-rc1', 'vv1.2.3', ' 1.2.3', '1.2.3\n', '']) assert.equal(parseVersion(bad), null, bad);
});

test('isBreaking: a "!" title', () => {
  assert.equal(isBreaking(checkTitle('feat!: x'), null), true);
});

test('isBreaking: a CRLF body with a BREAKING CHANGE line', () => {
  assert.equal(isBreaking(checkTitle('feat: x'), 'a\r\nBREAKING CHANGE: y'), true);
});

test('isBreaking: the marker mid-line does not count', () => {
  assert.equal(isBreaking(checkTitle('feat: x'), 'not BREAKING CHANGE: y'), false);
});

test('extractWhatsNew: a section followed by Why this shape', () => {
  const body = 'Lead.\n\n## What\'s new\n\nYou can now do a.\nAnd b.\n\n## Why this shape\n\nBecause.\n';
  assert.equal(extractWhatsNew(body), 'You can now do a.\nAnd b.');
});

test('extractWhatsNew: the last section excludes the Claude Code footer', () => {
  const body = '## What\'s new\n\nOne line.\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)\n';
  assert.equal(extractWhatsNew(body), 'One line.');
});

test('extractWhatsNew: ### headings and #123 lines stay inside the notes', () => {
  const body = '## What\'s new\n\n### Detail\n\n#123 fixed\n\n## Next\n';
  assert.equal(extractWhatsNew(body), '### Detail\n\n#123 fixed');
});

test('extractWhatsNew: no section is empty', () => {
  assert.equal(extractWhatsNew('## Why this shape\n\nx\n'), '');
});

test('extractWhatsNew: null is empty', () => {
  assert.equal(extractWhatsNew(null), '');
});

test('extractWhatsNew: a section only inside a multi-line comment is empty', () => {
  assert.equal(extractWhatsNew('<!--\n## What\'s new\n\nhidden\n-->\n\n## Why this shape\n'), '');
});

test('extractWhatsNew: the dashboard template with its untouched What\'s new section is empty', () => {
  const template = readFileSync(fileURLToPath(new URL('./fixtures/pull_request_template.md', import.meta.url)), 'utf8');
  assert.ok(template.includes("## What's new"), 'fixture lost its section');
  assert.equal(extractWhatsNew(template), '');
});

test('extractWhatsNew: a CRLF body is found and the notes carry no \\r', () => {
  const out = extractWhatsNew('Lead\r\n\r\n## What\'s new\r\n\r\nline one\r\nline two\r\n\r\n## Why this shape\r\n');
  assert.equal(out, 'line one\nline two');
  assert.ok(!out.includes('\r'));
});

test('extractWhatsNew: trailing whitespace on the heading is ignored', () => {
  assert.equal(extractWhatsNew('## What\'s new  \nnote\n'), 'note');
});

test('formatTagMessage/parseTagMessage round-trip: scoped breaking feat with notes', () => {
  const r = { title: 'feat(hub): add widgets', pr: 42, notes: 'Widgets show up in the hub.\n\n### Detail\nmore', type: 'feat' as const, scope: 'hub', breaking: true };
  assert.deepEqual(parseTagMessage(formatTagMessage(r)), {
    subject: 'feat(hub): add widgets (#42)',
    title: r.title,
    type: 'feat',
    scope: 'hub',
    pr: 42,
    breaking: true,
    notes: r.notes,
    items: [{ pr: 42, type: 'feat', scope: 'hub', breaking: true, title: r.title, notes: r.notes }],
  });
});

test('formatTagMessage/parseTagMessage round-trip: fix with empty notes', () => {
  const r = { title: 'fix: stop the crash', pr: 7, notes: '', type: 'fix' as const, breaking: false };
  assert.deepEqual(parseTagMessage(formatTagMessage(r)), {
    subject: 'fix: stop the crash (#7)',
    title: r.title,
    type: 'fix',
    pr: 7,
    breaking: false,
    notes: '',
    items: [{ pr: 7, type: 'fix', breaking: false, title: r.title, notes: '' }],
  });
});

test('formatTagMessage/parseTagMessage round-trip: notes ending in a Key: value line', () => {
  const r = { title: 'perf: faster scan', pr: 12, notes: 'Scans are quicker.\nNote: see #12', type: 'perf' as const, breaking: false };
  const parsed = parseTagMessage(formatTagMessage(r));
  assert.equal(parsed.notes, r.notes);
  assert.equal(parsed.type, 'perf');
  assert.equal(parsed.pr, 12);
});

test('formatTagMessage: an empty-notes fix is exactly subject, blank line, trailers', () => {
  assert.equal(formatTagMessage({ title: 'fix: x', pr: 7, notes: '', type: 'fix', breaking: false }), 'fix: x (#7)\n\nRelease-Type: fix\nRelease-PR: 7\n');
});

test('formatTagMessage: notes sit between subject and trailers, scope and breaking trailers in contract order', () => {
  assert.equal(
    formatTagMessage({ title: 'feat(a): b', pr: 3, notes: 'N', type: 'feat', scope: 'a', breaking: true }),
    'feat(a): b (#3)\n\nN\n\nRelease-Type: feat\nRelease-Scope: a\nRelease-PR: 3\nRelease-Breaking: true\n',
  );
});

test('parseTagMessage: a baseline tag has no trailers', () => {
  assert.deepEqual(parseTagMessage('Baseline — versioning starts here\n'), {
    subject: 'Baseline — versioning starts here',
    title: 'Baseline — versioning starts here',
    type: 'baseline',
    breaking: false,
    notes: '',
    items: [],
  });
});

test('parseTagMessage: a last paragraph with a non-trailer line is not trailers', () => {
  const p = parseTagMessage('fix: x (#1)\n\nRelease-Type: fix\nsome prose\n');
  assert.equal(p.type, 'baseline');
});

test('parseTagMessage: a trailer block without Release-Type is not trailers', () => {
  assert.equal(parseTagMessage('fix: x (#1)\n\nRelease-PR: 1\n').type, 'baseline');
});

// The rollup fixture from the batched-releases plan, oldest first: two kaizen items (one title-only and breaking), a routines fix, an unscoped perf.
const fx: RollupItem[] = [
  { pr: 336, title: 'feat(kaizen): verdict badges', type: 'feat', scope: 'kaizen', breaking: false, notes: '- Lessons show a verdict badge.' },
  { pr: 337, title: 'feat(kaizen)!: drop legacy log', type: 'feat', scope: 'kaizen', breaking: true, notes: '' },
  { pr: 320, title: 'fix(routines): show run length', type: 'fix', scope: 'routines', breaking: false, notes: 'Timeouts show how long a run lasted.' },
  { pr: 341, title: 'perf: faster scan', type: 'perf', breaking: false, notes: 'Faster scan.' },
];
const fxBody = [
  '### Kaizen',
  '',
  '- Lessons show a verdict badge. (#336)',
  '',
  'drop legacy log (#337)',
  '',
  '### Routines',
  '',
  'Timeouts show how long a run lasted. (#320)',
  '',
  '### Other',
  '',
  'Faster scan. (#341)',
].join('\n');
const fxItems = [
  { pr: 336, type: 'feat', scope: 'kaizen', breaking: false, notes: '- Lessons show a verdict badge.' },
  { pr: 337, type: 'feat', scope: 'kaizen', breaking: true, title: 'drop legacy log', notes: '' },
  { pr: 320, type: 'fix', scope: 'routines', breaking: false, notes: 'Timeouts show how long a run lasted.' },
  { pr: 341, type: 'perf', breaking: false, notes: 'Faster scan.' },
];
const item = (pr: number, type: ReleaseType, scope: string | undefined, notes: string, breaking = false): RollupItem => ({
  pr,
  title: `${type}${scope ? `(${scope})` : ''}${breaking ? '!' : ''}: item ${pr}`,
  type,
  ...(scope ? { scope } : {}),
  breaking,
  notes,
});

test('formatRollupMessage: subject, scope groups in first-appearance order with Other last, and the trailer block', () => {
  assert.equal(
    formatRollupMessage(fx),
    `Kaizen, Routines — 4 changes\n\n${fxBody}\n\nRelease-Type: feat\nRelease-Breaking: true\nRelease-Items: 336:feat:kaizen, ~337:feat!:kaizen, 320:fix:routines, 341:perf\n`,
  );
});

test('formatRollupMessage: the trailer block carries no Release-PR or Release-Scope and repeats no key', () => {
  const msg = formatRollupMessage(fx);
  const trailers = msg.trimEnd().split('\n\n').at(-1)!.split('\n');
  assert.deepEqual(trailers.map((l) => l.split(': ')[0]), ['Release-Type', 'Release-Breaking', 'Release-Items']);
});

test('formatRollupMessage: one item is "1 change", all unscoped is "N changes"', () => {
  assert.match(formatRollupMessage([item(1, 'feat', 'kaizen', 'A.')]), /^Kaizen — 1 change\n/);
  assert.match(formatRollupMessage([item(1, 'fix', undefined, 'A.'), item(2, 'perf', undefined, 'B.')]), /^2 changes\n\n### Other\n/);
});

test('formatRollupMessage: Release-Type ranks feat > fix > perf whatever the order; breaking never changes it', () => {
  const type = (items: RollupItem[]) => /^Release-Type: (.+)$/m.exec(formatRollupMessage(items))![1];
  assert.equal(type([item(1, 'fix', undefined, 'A.'), item(2, 'perf', undefined, 'B.')]), 'fix');
  assert.equal(type([item(1, 'perf', undefined, 'A.'), item(2, 'fix', undefined, 'B.')]), 'fix');
  assert.equal(type([item(1, 'perf', undefined, 'A.'), item(2, 'feat', undefined, 'B.')]), 'feat');
  const breakingPerf = formatRollupMessage([item(1, 'fix', undefined, 'A.'), item(2, 'perf', undefined, 'B.', true)]);
  assert.equal(type([item(1, 'fix', undefined, 'A.'), item(2, 'perf', undefined, 'B.', true)]), 'fix');
  assert.match(breakingPerf, /^Release-Breaking: true$/m);
  assert.doesNotMatch(formatRollupMessage([item(1, 'fix', undefined, 'A.')]), /Release-Breaking/);
});

test('formatRollupMessage: interleaved scopes are grouped, and Release-Items follows body order', () => {
  const msg = formatRollupMessage([item(1, 'feat', 'kaizen', 'A.'), item(2, 'fix', 'routines', 'B.'), item(3, 'fix', 'kaizen', 'C.')]);
  assert.match(msg, /^Kaizen, Routines — 3 changes\n\n### Kaizen\n\nA\. \(#1\)\n\nC\. \(#3\)\n\n### Routines\n\nB\. \(#2\)\n\n/);
  assert.match(msg, /^Release-Items: 1:feat:kaizen, 3:fix:kaizen, 2:fix:routines$/m);
  assert.deepEqual(parseTagMessage(msg).items.map((i) => i.pr), [1, 3, 2]);
});

test('formatRollupMessage/parseTagMessage round-trip: the release keeps subject and body, items come back in order', () => {
  const p = parseTagMessage(formatRollupMessage(fx));
  assert.equal(p.type, 'feat');
  assert.equal(p.breaking, true);
  assert.equal(p.pr, undefined);
  assert.equal(p.scope, undefined);
  assert.equal(p.subject, 'Kaizen, Routines — 4 changes');
  assert.equal(p.title, 'Kaizen, Routines — 4 changes');
  assert.equal(p.notes, fxBody);
  assert.deepEqual(p.items, fxItems);
});

test('parseTagMessage: a scope named t round-trips as a scope with its notes, not as a title-only item', () => {
  const p = parseTagMessage(formatRollupMessage([{ pr: 5, title: 'feat(t): x', type: 'feat', scope: 't', breaking: false, notes: 'T notes.' }]));
  assert.deepEqual(p.items, [{ pr: 5, type: 'feat', scope: 't', breaking: false, notes: 'T notes.' }]);
});

test('formatRollupMessage: notes already ending in the item\'s own (#N) carry the marker once, and later items still parse', () => {
  const items = [{ ...fx[0], notes: '- Lessons show a verdict badge. (#336)' }, ...fx.slice(1)];
  const msg = formatRollupMessage(items);
  assert.match(msg, /^- Lessons show a verdict badge\. \(#336\)$/m);
  assert.doesNotMatch(msg, /\(#336\) \(#336\)/);
  assert.deepEqual(parseTagMessage(msg).items, fxItems);
});

test('formatRollupMessage: the item\'s own (#N) mid-notes is stripped from every line, so it cannot end the item early', () => {
  const items = [{ ...fx[0], notes: 'see (#336)\nmore' }, ...fx.slice(1)];
  const msg = formatRollupMessage(items);
  assert.match(msg, /^### Kaizen\n\nsee\nmore \(#336\)\n\ndrop legacy log \(#337\)$/m);
  assert.deepEqual(parseTagMessage(msg).items, [{ ...fxItems[0], notes: 'see\nmore' }, ...fxItems.slice(1)]);
});

test('parseTagMessage: notes holding their own ### heading and another PR\'s (#123) line leave the items unchanged (Review Focus 3)', () => {
  const notes = '### Sub\n\nsee (#123)\nlast line';
  const items = [{ ...fx[0], notes }, ...fx.slice(1)];
  assert.deepEqual(parseTagMessage(formatRollupMessage(items)).items, [{ ...fxItems[0], notes }, ...fxItems.slice(1)]);
  // The same notes as the first item of a group, whose heading the reader skips: the item's own heading must survive.
  const later = [fx[0], fx[1], { ...fx[2], notes }, fx[3]];
  assert.deepEqual(parseTagMessage(formatRollupMessage(later)).items, [fxItems[0], fxItems[1], { ...fxItems[2], notes }, fxItems[3]]);
});

test('parseTagMessage: a CRLF rollup message parses the same as LF', () => {
  const msg = formatRollupMessage(fx);
  assert.deepEqual(parseTagMessage(msg.replace(/\n/g, '\r\n')), parseTagMessage(msg));
});

test('parseTagMessage: a per-PR tag with a Release-Type but no Release-PR has no items', () => {
  assert.deepEqual(parseTagMessage('fix: x\n\nRelease-Type: fix\n').items, []);
});

// parseTagMessage as v1.3.0 shipped it (commit 926e12d): the reader every consumer pinned to v1.3.0 runs over the first rollup tag it meets.
const RELEASE_TYPES_V130: readonly string[] = ['feat', 'fix', 'perf'];
const TRAILER_V130 = /^([A-Za-z][A-Za-z0-9-]*): (.*)$/;
function parseV130(msg: string): Omit<ParsedTag, 'items'> {
  const lines = msg.replace(/\r\n/g, '\n').trimEnd().split('\n');
  const subject = lines[0] ?? '';
  const title = subject.replace(/ \(#\d+\)$/, '');
  const body = lines.slice(1);
  const blank = body.lastIndexOf('');
  const last = body.slice(blank + 1);
  const trailers = new Map<string, string>();
  for (const l of last) {
    const m = TRAILER_V130.exec(l);
    if (m) trailers.set(m[1], m[2]);
  }
  const type = trailers.get('Release-Type');
  if (last.length === 0 || trailers.size !== last.length || !type || !RELEASE_TYPES_V130.includes(type)) {
    return { subject, title, type: 'baseline', breaking: false, notes: body.join('\n').trim() };
  }
  const pr = trailers.get('Release-PR');
  const out: Omit<ParsedTag, 'items'> = {
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

test('a v1.3.0 reader over a rollup tag sees a release, not a baseline, with no PR or scope and the grouped body as notes (Review Focus 4)', () => {
  const p = parseV130(formatRollupMessage(fx));
  assert.equal(p.type, 'feat');
  assert.equal(p.breaking, true);
  assert.equal(p.pr, undefined);
  assert.equal(p.scope, undefined);
  assert.equal(p.title, 'Kaizen, Routines — 4 changes');
  assert.equal(p.notes, fxBody);
});

test('isNoneOptOut: true for None in any case, with or without a dash reason, and surrounding whitespace', () => {
  for (const n of ['None', 'none', 'None — internal only', 'None - internal', '  None  ']) assert.equal(isNoneOptOut(n), true, JSON.stringify(n));
});

test('isNoneOptOut: false for empty text and for notes that merely start with None', () => {
  for (const n of ['', 'Nonexistent flag fixed', 'None of the tabs flicker now', '- None']) assert.equal(isNoneOptOut(n), false, JSON.stringify(n));
});

test('releaseNotes: a None section is empty, real notes pass through unchanged', () => {
  assert.equal(releaseNotes("## What's new\n\nNone — refactor\n\n## Verification\n\nx"), '');
  assert.equal(releaseNotes("## What's new\n\nTabs stop flickering.\n\n### Detail\nmore\n"), "Tabs stop flickering.\n\n### Detail\nmore");
  assert.equal(releaseNotes(null), '');
});

const withSection = (section: string) => `## Summary\n\nx\n\n## What's new\n\n${section}\n\n## Verification\n\ny`;

test('checkNotes: a releasing PR with an empty section, a comment-only section, or no body is refused naming What\'s new', () => {
  const template = "<!-- Describe the change for users. -->";
  for (const body of [withSection(''), withSection(template), `## What's new\n\n${template}\n`, null]) {
    const r = checkNotes('feat(x): y', body);
    assert.equal(r.ok, false, JSON.stringify(body));
    assert.match(r.reason ?? '', /What's new/);
  }
});

test('checkNotes: ok with notes, with a None opt-out, on a silent type, and on an invalid title', () => {
  assert.deepEqual(checkNotes('feat(x): y', withSection('Tabs stop flickering.')), { ok: true });
  assert.equal(checkNotes('fix: y', withSection('None')).ok, true);
  assert.equal(checkNotes('perf: y', withSection('None — internal')).ok, true);
  assert.equal(checkNotes('docs: y', withSection('')).ok, true);
  assert.equal(checkNotes('chore: y', null).ok, true);
  assert.equal(checkNotes('chore!: y', withSection('')).ok, true);
  assert.equal(checkNotes('not a title', null).ok, true);
});
