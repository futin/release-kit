import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { checkNotes, checkTitle, extractWhatsNew, formatTagMessage, isBreaking, isNoneOptOut, nextVersion, parseTagMessage, parseVersion, releaseNotes } from '../src/index.js';

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
  assert.deepEqual(parseTagMessage(formatTagMessage(r)), { subject: 'feat(hub): add widgets (#42)', title: r.title, type: 'feat', scope: 'hub', pr: 42, breaking: true, notes: r.notes });
});

test('formatTagMessage/parseTagMessage round-trip: fix with empty notes', () => {
  const r = { title: 'fix: stop the crash', pr: 7, notes: '', type: 'fix' as const, breaking: false };
  assert.deepEqual(parseTagMessage(formatTagMessage(r)), { subject: 'fix: stop the crash (#7)', title: r.title, type: 'fix', pr: 7, breaking: false, notes: '' });
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
  });
});

test('parseTagMessage: a last paragraph with a non-trailer line is not trailers', () => {
  const p = parseTagMessage('fix: x (#1)\n\nRelease-Type: fix\nsome prose\n');
  assert.equal(p.type, 'baseline');
});

test('parseTagMessage: a trailer block without Release-Type is not trailers', () => {
  assert.equal(parseTagMessage('fix: x (#1)\n\nRelease-PR: 1\n').type, 'baseline');
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
