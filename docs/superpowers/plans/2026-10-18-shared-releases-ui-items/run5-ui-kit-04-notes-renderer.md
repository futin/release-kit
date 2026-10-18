## Goal

ui-kit's default notes renderer turns release-note markdown into safe HTML on its own, with no app sanitiser behind it. Spec D14.

Source: plan Task D3 in futin/release-kit `docs/superpowers/plans/2026-10-18-shared-releases-ui.md`,
spec `docs/superpowers/specs/2026-10-18-shared-releases-ui-design.md`
(local checkout `/Users/andrejajevtic/Documents/custom-projects/release-kit`). The plan gives behaviour and test cases, never literal code; where the code
disagrees with this item, follow the code and say so in your report.

Constraints (ui-kit): classes `uk-*`, custom properties `--uk-*` each with a fallback; shipped CSS has no media queries; components never import CSS. `react`
peer `^18.3 || ^19`, no `react-dom` peer. No runtime dependency on release-kit (devDependency only, spec D19). `npm run build` before `npm test`; `dist/` is
committed with every `src/` change.

## Plan

Files: create `src/releases/notes.ts`; new `test/notes.test.ts`. Produces `renderNotesHtml(md: string): string`.

1. Write the cases below; run red.
2. Implement by porting guide-manager's escape-first renderer (`/Users/andrejajevtic/Documents/custom-projects/guide-manager`), with links built carrying
   `target="_blank" rel="noopener noreferrer"`. Run green. Commit `feat(releases): notes renderer`.

## Test cases

- `<script>alert(1)</script>` → output contains `&lt;script&gt;` and no `<script`.
- `<img src=x onerror=alert(1)>` → no `<img`.
- `[x](javascript:alert(1))` → no `<a`.
- `[docs](https://e.com/a)` → exactly one `<a href="https://e.com/a" target="_blank" rel="noopener noreferrer">docs</a>`.
- `[q](https://e.com/"onmouseover="x)` → the `"` appears as `&quot;` inside the href; no `onmouseover=` attribute.
- `[a (b)](https://e.com/?x=1&y=2)` → one anchor whose href is `https://e.com/?x=1&amp;y=2` (nothing leaks out of the attribute).
- `- one\n- two` → `<ul><li>one</li><li>two</li></ul>`.
- `` `a<b` `` → `<code>a&lt;b</code>`; `**bold**` → `<strong>bold</strong>`; `a\nb\n\nc` → `<p>a<br>b</p><p>c</p>`.

## Done when

- `npm run build` leaves `git status --porcelain dist` empty after the commit.
- `npm test` passes.
- `npm run typecheck` passes.
