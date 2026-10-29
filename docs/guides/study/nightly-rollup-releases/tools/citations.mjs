// Classifies every excerpt labelled `// path:N-M` (or `# path:N-M`) in the guide against the current source: fresh, stale (moved), gone, or abridged.
// `node docs/guides/study/nightly-rollup-releases/tools/citations.mjs [--fix]` — --fix rewrites only stale labels, never a gone one, so changed code never
// looks freshly verified. Exits non-zero when anything is stale or gone.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { SOURCE } from './build.mjs';

const ROOT = fileURLToPath(new URL('../../../../../', import.meta.url));
const LABEL = /^(\s*(?:\/\/|#)\s*)(\S+?):(\d+)-(\d+)(.*)$/;
const fix = process.argv.includes('--fix');

let md = readFileSync(SOURCE, 'utf8');
const lines = md.split('\n');
const results = [];
for (let i = 0; i < lines.length; i++) {
  if (!/^```/.test(lines[i])) continue;
  const label = LABEL.exec(lines[i + 1] ?? '');
  let j = i + 1;
  while (j < lines.length && !/^```/.test(lines[j])) j++;
  if (label) {
    const [, lead, path, from, to, rest] = label;
    const excerpt = lines.slice(i + 2, j);
    const r = { line: i + 2, path, from: Number(from), to: Number(to), lead, rest };
    if (/abridged|compacted/.test(rest)) r.status = 'abridged';
    else classify(r, excerpt);
    results.push(r);
  }
  i = j;
}

function classify(r, excerpt) {
  let src;
  try {
    src = readFileSync(ROOT + r.path, 'utf8').split('\n').map((l) => l.trim());
  } catch {
    r.status = 'gone';
    return;
  }
  const ex = excerpt.map((l) => l.trim());
  const distinctive = ex.map((l, k) => ({ l, k })).filter(({ l }) => l.length > 3);
  const present = distinctive.filter(({ l }) => src.includes(l));
  // Coverage decides gone; the most unique present line (fewest occurrences, then longest) decides where.
  if (present.length / Math.max(distinctive.length, 1) < 0.6) {
    r.status = 'gone';
    return;
  }
  const count = (l) => src.filter((s) => s === l).length;
  present.sort((a, b) => count(a.l) - count(b.l) || b.l.length - a.l.length);
  const anchor = present[0];
  const at = src.indexOf(anchor.l) + 1 - anchor.k;
  if (at === r.from) r.status = 'fresh';
  else {
    r.status = 'stale';
    r.newFrom = at;
    r.newTo = at + (r.to - r.from);
  }
}

for (const r of results) {
  const where = `${r.path}:${r.from}-${r.to}`;
  console.log(`${r.status.padEnd(8)} guide line ${r.line}  ${where}${r.status === 'stale' ? ` → ${r.newFrom}-${r.newTo}` : ''}`);
}
const stale = results.filter((r) => r.status === 'stale');
if (fix && stale.length) {
  const out = md.split('\n');
  for (const r of stale) out[r.line - 1] = `${r.lead}${r.path}:${r.newFrom}-${r.newTo}${r.rest}`;
  md = out.join('\n');
  writeFileSync(SOURCE, md);
  console.log(`fixed ${stale.length} stale label(s); re-run build.mjs`);
}
if (results.some((r) => r.status === 'gone' || (r.status === 'stale' && !fix))) process.exit(1);
