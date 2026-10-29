// Verifies the generated page against the markdown; exits non-zero on any failure. Run after build.mjs:
// `node docs/guides/study/nightly-rollup-releases/tools/check.mjs`.
import { readFileSync } from 'node:fs';
import { PAGE, SOURCE } from './build.mjs';

const md = readFileSync(SOURCE, 'utf8').replace(/\r\n/g, '\n');
const html = readFileSync(PAGE, 'utf8');
const failures = [];

// 1. No link a browser cannot render, and every in-page anchor lands on an id.
const hrefs = [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);
for (const h of hrefs.filter((h) => /\.md(#|$)/.test(h))) failures.push(`.md link left in page: ${h}`);
const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
for (const h of hrefs.filter((h) => h.startsWith('#'))) if (!ids.has(h.slice(1))) failures.push(`anchor with no target: ${h}`);

// 2. Fidelity: every markdown line's word sequence appears in the page's visible text. Deliberate exclusions: the H1 (rendered as the page title), HTML
// comments (provenance metadata), mermaid fence bodies (replaced by figures), link URLs, and the blockquote pointing at the page itself.
const decode = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
const words = (s) => (s.match(/[\p{L}\p{N}]+/gu) ?? []).join(' ');
const visible = ` ${words(decode(html.replace(/<(script|style)[\s\S]*?<\/\1>/g, ' ').replace(/<[^>]+>/g, ' ')))} `;
const lines = md.split('\n');
let inFence = false;
let mermaid = false;
let missing = 0;
for (let i = 0; i < lines.length; i++) {
  const l = lines[i];
  const fence = /^```(\S*)/.exec(l);
  if (fence) {
    if (inFence) { inFence = false; mermaid = false; } else { inFence = true; mermaid = fence[1] === 'mermaid'; }
    continue;
  }
  if (mermaid || (!inFence && (/^# /.test(l) || /^<!--.*-->\s*$/.test(l) || /^\|[-| ]+\|\s*$/.test(l)))) continue;
  if (!inFence && /^> /.test(l)) {
    let s = i;
    while (s > 0 && /^> /.test(lines[s - 1])) s--;
    let e = i;
    while (e < lines.length - 1 && /^> /.test(lines[e + 1])) e++;
    if (lines.slice(s, e + 1).join(' ').includes('](./nightly-rollup-releases.html)')) continue;
  }
  const w = words(inFence ? l : l.replace(/\]\([^)]*\)/g, ']'));
  if (w && !visible.includes(` ${w} `)) {
    missing++;
    failures.push(`line ${i + 1} missing from page: ${l.trim().slice(0, 100)}`);
  }
}

// 3. No leaked markdown in prose: code, pre, svg, script and style legitimately hold these characters, so they are stripped first.
const prose = decode(
  html
    .replace(/<(pre|code|svg|script|style)[\s\S]*?<\/\1>/g, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' '),
);
for (const [re, what] of [[/\*\*/, '**'], [/`/, 'backtick'], [/\]\(/, ']('], [/^\s*\|.*\|\s*$/m, 'table pipe row']]) {
  if (re.test(prose)) failures.push(`leaked markdown in page: ${what}`);
}

// 4. Offline guarantee: no external scripts, stylesheets, fonts or images.
if (/<script[^>]+src=/i.test(html)) failures.push('external script');
if (/<link[^>]+rel="?stylesheet/i.test(html)) failures.push('external stylesheet');
if (/<img\b/i.test(html) || /url\(\s*['"]?https?:/i.test(html) || /@import/i.test(html)) failures.push('external asset');

if (failures.length) {
  for (const f of failures) console.error(`FAIL ${f}`);
  process.exit(1);
}
console.log(`ok: ${hrefs.length} links, ${ids.size} ids, ${lines.length} markdown lines checked, ${missing} missing`);
