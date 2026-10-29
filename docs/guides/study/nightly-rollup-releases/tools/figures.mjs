// Hand-authored SVG for the guide's mermaid fences, in fence order. The page must render offline, so mermaid.js is never loaded; every colour is a CSS
// variable so the figures follow the page's light/dark theme.

const arrow = (id) =>
  `<defs><marker id="${id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">` +
  `<path d="M 0 0 L 10 5 L 0 10 z" fill="var(--line)"/></marker></defs>`;

export const figures = [
  {
    caption: 'One run, end to end: the walk collects items, and only the last step tags.',
    svg: `<svg viewBox="0 0 960 250" role="img" xmlns="http://www.w3.org/2000/svg">
  <title>A schedule or dispatch runs release-cli.ts, which walks base..target; each commit returns a RollupItem; the largest type picks the version; one tag on the target becomes the GitHub Release</title>
  ${arrow('a1')}
  <g stroke="var(--line)" stroke-width="1.5" fill="var(--panel)">
    <rect x="5" y="40" width="160" height="50" rx="6"/>
    <rect x="285" y="40" width="140" height="50" rx="6"/>
    <rect x="540" y="40" width="160" height="50" rx="6" stroke="var(--accent)"/>
    <rect x="790" y="40" width="160" height="50" rx="6"/>
    <rect x="545" y="170" width="150" height="50" rx="6"/>
    <rect x="270" y="170" width="150" height="50" rx="6" stroke="var(--accent)"/>
    <rect x="30" y="170" width="130" height="50" rx="6"/>
  </g>
  <g fill="var(--fg)" font-size="13" font-family="ui-monospace, Menlo, monospace" text-anchor="middle">
    <text x="85" y="70">schedule / dispatch</text>
    <text x="355" y="70">release-cli.ts</text>
    <text x="620" y="70">walk base..target</text>
    <text x="870" y="70">releaseCommit</text>
    <text x="620" y="200">nextVersion</text>
    <text x="345" y="200">one tag on target</text>
    <text x="95" y="200">GitHub Release</text>
  </g>
  <g stroke="var(--line)" stroke-width="1.5" fill="none" marker-end="url(#a1)">
    <line x1="165" y1="65" x2="283" y2="65"/>
    <line x1="425" y1="65" x2="538" y2="65"/>
    <line x1="700" y1="55" x2="788" y2="55"/>
    <line x1="790" y1="78" x2="702" y2="78"/>
    <line x1="620" y1="90" x2="620" y2="168"/>
    <line x1="545" y1="195" x2="422" y2="195"/>
    <line x1="270" y1="195" x2="162" y2="195"/>
  </g>
  <g fill="var(--muted)" font-size="11" font-family="system-ui, sans-serif" text-anchor="middle">
    <text x="225" y="57">RELEASE_MODE=rollup</text>
    <text x="482" y="57">runRelease(mode)</text>
    <text x="745" y="47">each commit</text>
    <text x="745" y="108">RollupItem, no tag</text>
    <text x="630" y="135" text-anchor="start">largest type wins</text>
    <text x="483" y="187">formatRollupMessage</text>
    <text x="216" y="187">parseTagMessage</text>
  </g>
</svg>`,
  },
  {
    caption: 'releaseCommit: the first three exits are shared by both modes; only a releasable PR forks on the mode.',
    svg: `<svg viewBox="0 0 960 300" role="img" xmlns="http://www.w3.org/2000/svg">
  <title>A commit is already released, has no PR, or is not releasing; a releasable PR is tagged in per-PR mode or returned as a RollupItem in rollup mode</title>
  ${arrow('a2')}
  <g stroke="var(--line)" stroke-width="1.5" fill="var(--panel)">
    <rect x="380" y="10" width="140" height="40" rx="6"/>
    <rect x="10" y="120" width="190" height="50" rx="6"/>
    <rect x="230" y="120" width="190" height="50" rx="6"/>
    <rect x="450" y="120" width="190" height="50" rx="6"/>
    <rect x="700" y="120" width="160" height="50" rx="25" stroke="var(--accent)"/>
    <rect x="570" y="230" width="180" height="50" rx="6"/>
    <rect x="790" y="230" width="160" height="50" rx="6" stroke="var(--accent)"/>
  </g>
  <g fill="var(--fg)" font-size="13" font-family="ui-monospace, Menlo, monospace" text-anchor="middle">
    <text x="450" y="35">commit</text>
    <text x="105" y="141">already-released /</text>
    <text x="105" y="158">release-repaired</text>
    <text x="325" y="150">no-pr, warn, continue</text>
    <text x="545" y="150">not-releasing</text>
    <text x="780" y="150">rollup?</text>
    <text x="660" y="251">tag this commit</text>
    <text x="660" y="268">+ Release</text>
    <text x="870" y="260">return RollupItem</text>
  </g>
  <g stroke="var(--line)" stroke-width="1.5" fill="none" marker-end="url(#a2)">
    <line x1="430" y1="50" x2="105" y2="118"/>
    <line x1="440" y1="50" x2="325" y2="118"/>
    <line x1="460" y1="50" x2="545" y2="118"/>
    <line x1="470" y1="50" x2="780" y2="118"/>
    <line x1="760" y1="170" x2="662" y2="228"/>
    <line x1="800" y1="170" x2="868" y2="228"/>
  </g>
  <g fill="var(--muted)" font-size="11" font-family="system-ui, sans-serif">
    <text x="99" y="110" text-anchor="end">has version tag</text>
    <text x="319" y="110" text-anchor="end">no merged PR</text>
    <text x="551" y="110">type not feat, fix, perf</text>
    <text x="786" y="110">releasable PR</text>
    <text x="688" y="205" text-anchor="end">no</text>
    <text x="852" y="205">yes</text>
  </g>
</svg>`,
  },
];
