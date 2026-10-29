// Generates ../nightly-rollup-releases.html from ../nightly-rollup-releases.md. The markdown is canonical: edit it and re-run
// `node docs/guides/study/nightly-rollup-releases/tools/build.mjs`; never edit the page by hand. A deliberately small renderer, covering only the
// constructs the guide uses: headings, paragraphs, lists, blockquotes, tables, fenced code, and mermaid fences swapped for figures.mjs.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { figures } from './figures.mjs';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
export const SOURCE = here('../nightly-rollup-releases.md');
export const PAGE = here('../nightly-rollup-releases.html');
const SELF = './nightly-rollup-releases.html';

export const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// GitHub's slug rules: lowercase, punctuation dropped, every space its own hyphen (runs are not collapsed).
export const slug = (s) =>
  s
    .replace(/`/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/\s/g, '-');

// Code spans first, behind NUL-delimited placeholders that cannot occur in prose; the backreference pairs a run with a run of the same length.
export function inline(s) {
  const codes = [];
  s = s.replace(/(`+)(.+?)\1(?!`)/g, (_, _t, c) => `\u0000${codes.push(c.trim()) - 1}\u0000`);
  s = esc(s);
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, href) => {
    const out = /^https?:/.test(href) || !href.startsWith('#');
    return `<a href="${href}">${label}${out ? ' ↗' : ''}</a>`;
  });
  s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?!\*)/g, '$1<em>$2</em>');
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${esc(codes[Number(i)])}</code>`);
}

export function render(md) {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const out = [];
  const toc = [];
  let title = '';
  let fig = 0;
  let i = 0;
  const isBlockStart = (l) => /^(#{1,6} |```|> ?|\||- |\d+\. |---\s*$)/.test(l) || l.trim() === '' || /^<!--.*-->\s*$/.test(l);
  while (i < lines.length) {
    const l = lines[i];
    if (l.trim() === '' || /^<!--.*-->\s*$/.test(l)) { i++; continue; }
    let m;
    if ((m = /^# (.*)$/.exec(l))) { title = m[1]; i++; continue; }
    if ((m = /^(#{2,6}) (.*)$/.exec(l))) {
      const level = m[1].length;
      const id = slug(m[2]);
      if (level === 2) toc.push({ id, html: inline(m[2]) });
      out.push(`<h${level} id="${id}">${inline(m[2])}</h${level}>`);
      i++;
      continue;
    }
    if ((m = /^```(\S*)/.exec(l))) {
      const lang = m[1];
      const body = [];
      for (i++; i < lines.length && !lines[i].startsWith('```'); i++) body.push(lines[i]);
      i++;
      if (lang === 'mermaid') {
        const f = figures[fig++];
        if (!f) throw new Error(`mermaid fence ${fig} has no figure in figures.mjs`);
        out.push(`<figure class="diagram">${f.svg}<figcaption>${inline(f.caption)}</figcaption></figure>`);
      } else {
        out.push(`<pre><code class="lang-${esc(lang || 'text')}">${esc(body.join('\n'))}</code></pre>`);
      }
      continue;
    }
    if (/^---\s*$/.test(l)) { out.push('<hr>'); i++; continue; }
    if (/^> ?/.test(l)) {
      const body = [];
      for (; i < lines.length && /^> ?/.test(lines[i]); i++) body.push(lines[i].replace(/^> ?/, ''));
      const text = body.join(' ');
      // The markdown's "read it in a browser" pointer names this very page; on the page it would point the reader at what they are reading.
      if (text.includes(`](${SELF})`)) continue;
      out.push(`<blockquote><p>${inline(text)}</p></blockquote>`);
      continue;
    }
    if (l.startsWith('|')) {
      const rows = [];
      for (; i < lines.length && lines[i].startsWith('|'); i++) rows.push(lines[i]);
      const cells = (r) => r.replace(/^\||\|\s*$/g, '').split('|').map((c) => inline(c.trim()));
      const head = cells(rows[0]).map((c) => `<th>${c}</th>`).join('');
      const body = rows.slice(2).map((r) => `<tr>${cells(r).map((c) => `<td>${c}</td>`).join('')}</tr>`).join('');
      out.push(`<div class="tablewrap"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`);
      continue;
    }
    if ((m = /^(- |\d+\. )/.exec(l))) {
      const ordered = m[1] !== '- ';
      const items = [];
      while (i < lines.length && /^(- |\d+\. )/.test(lines[i])) {
        const item = [lines[i].replace(/^(- |\d+\. )/, '')];
        // An indented continuation line belongs to the bullet above it.
        for (i++; i < lines.length && /^\s{2,}\S/.test(lines[i]); i++) item.push(lines[i].trim());
        items.push(`<li>${inline(item.join(' '))}</li>`);
      }
      const tag = ordered ? 'ol' : 'ul';
      out.push(`<${tag}>${items.join('')}</${tag}>`);
      continue;
    }
    const para = [];
    for (; i < lines.length && (para.length === 0 || !isBlockStart(lines[i])); i++) para.push(lines[i].trim());
    out.push(`<p>${inline(para.join(' '))}</p>`);
  }
  if (fig !== figures.length) throw new Error(`figures.mjs has ${figures.length} figures but the markdown has ${fig} mermaid fences`);
  return { title, toc, body: out.join('\n') };
}

const CSS = `
:root{--bg:#ffffff;--fg:#1a1a1a;--muted:#5c6370;--line:#b8bec9;--panel:#f5f6f8;--accent:#2563eb;--good:#15803d;--bad:#b91c1c}
@media (prefers-color-scheme: dark){:root{--bg:#14161a;--fg:#e6e8ea;--muted:#9aa2ad;--line:#4a515c;--panel:#1d2027;--accent:#7aa2f7;--good:#6ccf8e;--bad:#f2777a}}
*{box-sizing:border-box}
body{background:var(--bg);color:var(--fg);font:16px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif;margin:0}
code,pre{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.9em}
code{overflow-wrap:anywhere;background:var(--panel);padding:.05em .3em;border-radius:4px}
pre{background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:.9rem 1rem;overflow-x:auto}
pre code{overflow-wrap:normal;background:none;padding:0}
a{color:var(--accent)}
blockquote{margin:1.25rem 0;padding:.6rem 1rem;border-left:4px solid var(--accent);background:var(--panel);border-radius:0 8px 8px 0}
blockquote p{margin:0}
.diagram{overflow-x:auto;margin:1.5rem 0}
.diagram svg{display:block;min-width:40rem;width:100%;height:auto}
figcaption{color:var(--muted);font-size:.9rem;margin-top:.4rem}
.tablewrap{overflow-x:auto;margin:1.25rem 0}
table{border-collapse:collapse}
th,td{border:1px solid var(--line);padding:.4rem .7rem;text-align:left}
th{background:var(--panel)}
hr{border:0;border-top:1px solid var(--line);margin:2rem 0}
.shell{display:grid;grid-template-columns:17rem minmax(0,1fr);gap:1rem;max-width:78rem;margin:0 auto;padding:0 1.25rem}
.side{position:sticky;top:0;max-height:100vh;overflow-y:auto;padding:2rem 0}
nav.toc ol{list-style:none;padding:0;margin:0}
nav.toc a{display:block;padding:.3rem .6rem;border-radius:6px;text-decoration:none;color:var(--muted);font-size:.9rem}
nav.toc a.active{color:var(--fg);background:var(--panel);font-weight:600}
nav.toc .toctitle{font-weight:700;margin:0 0 .5rem .6rem}
main{max-width:60rem;padding:2rem 0 4rem}
.lede{color:var(--muted)}
.navbar,#navtoggle,.backtop{display:none}
@media (max-width:63.99rem){
  .shell{grid-template-columns:minmax(0,1fr)}
  .navbar{display:block;position:sticky;top:0;z-index:2;background:var(--bg);border-bottom:1px solid var(--line);padding:.6rem 1.25rem}
  .navbar label{cursor:pointer;color:var(--accent);font-weight:600}
  .side{position:static;max-height:none;padding:1rem 0 0}
  nav.toc{display:none}
  #navtoggle:checked ~ .shell nav.toc{display:block}
  .backtop{display:block}
  main{padding-top:1rem}
}
`;

const SPY = `
(function(){
  var links=[].slice.call(document.querySelectorAll('nav.toc a[href^="#"]'));
  var heads=links.map(function(a){return document.getElementById(a.getAttribute('href').slice(1));});
  function scroller(){var s=document.querySelector('.side'),n=document.querySelector('nav.toc');return s&&s.scrollHeight>s.clientHeight?s:n;}
  function update(){
    var line=window.innerHeight*0.25,idx=-1;
    heads.forEach(function(h,i){if(h&&h.getBoundingClientRect().top<=line)idx=i;});
    links.forEach(function(a,i){a.classList.toggle('active',i===idx);});
    if(idx<0)return;
    var box=scroller();if(!box||box.scrollHeight<=box.clientHeight)return;
    var lr=links[idx].getBoundingClientRect(),br=box.getBoundingClientRect();
    if(lr.top<br.top||lr.bottom>br.bottom)box.scrollTop+=lr.top-br.top-br.height/2;
  }
  window.addEventListener('scroll',update,{passive:true});window.addEventListener('resize',update);update();
})();
`;

export function build() {
  const { title, toc, body } = render(readFileSync(SOURCE, 'utf8'));
  const vendored = (f) => readFileSync(here(f), 'utf8');
  const nav = toc.map((t) => `<li><a href="#${t.id}">${t.html}</a></li>`).join('');
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title.replace(/`/g, ''))}</title>
<style>${CSS}
${vendored('./bionic.css')}</style>
</head>
<body>
<input type="checkbox" id="navtoggle" hidden>
<div class="navbar"><label for="navtoggle">☰ Contents</label></div>
<div class="shell">
<aside class="side">
${vendored('./bionic.html')}
<nav class="toc" id="contents"><p class="toctitle">Contents</p><ol>${nav}</ol></nav>
</aside>
<main>
<h1>${inline(title)}</h1>
<p class="lede">Generated from <code>docs/guides/study/nightly-rollup-releases/nightly-rollup-releases.md</code> by <code>tools/build.mjs</code> — edit the markdown, not this file.</p>
${body}
<p class="backtop"><a href="#contents">↑ back to contents</a></p>
</main>
</div>
<script>${SPY}</script>
<script>${vendored('./bionic.js')}</script>
</body>
</html>
`;
  writeFileSync(PAGE, html);
  return html;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  build();
  console.log(`wrote ${PAGE}`);
}
