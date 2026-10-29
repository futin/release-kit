/* bionic v3 — vendored from guide-manager assets/; do not edit here */
(function () {
  'use strict';

  var WORD = /\p{L}[\p{L}\p{M}’']*/gu;
  // Matches a combining mark, so a bold/plain split never lands between a
  // base character and the mark stacked on it (NFD text, e.g. combining
  // diaeresis).
  var MARK = /\p{M}/u;

  // How many leading characters of a word to bold. Never the whole word: a
  // fully bold word carries no fixation point, which is the only thing the
  // bolding is for. `len` counts characters (code points), not UTF-16 code
  // units, so an astral character (surrogate pair) counts as one — decorate()
  // is what turns this count into the right string index.
  //
  // Single-letter words (the "e" in "e.g.") return 0 here and still consume a
  // word index in decorate(): an abbreviation-heavy sentence gets a visibly
  // irregular bold rhythm at freq >= 2. That is the spec as written, not a bug.
  function bionicWord(word, strength) {
    var len = Array.from(word).length;
    if (len < 2) return 0;
    if (len <= 3) return 1;
    var n = Math.round(len * strength);
    return Math.min(Math.max(n, 1), len - 1);
  }

  function shouldBold(wordIndex, freq) {
    return wordIndex % freq === 0;
  }

  function escapeHtml(s) {
    return s.replace(/[&<>]/g, function (c) {
      return c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&gt;';
    });
  }

  // `n` is a candidate split point into `chars` (an Array.from(word)).
  // If chars[n] is a combining mark, the split falls inside a base-plus-marks
  // cluster and has to move: prefer extending the bold prefix past the whole
  // run of marks, but if that run reaches the end of the word — which would
  // leave nothing plain, violating "never bold the whole word" — back the
  // boundary off before the cluster's base character instead. A word that is
  // one cluster (a single base plus its marks, e.g. NFD "e" + combining
  // acute) has no legal split at all; this returns 0 for that case, which the
  // caller already treats the same as any other unboldable word.
  function markSafeSplit(chars, n) {
    if (!MARK.test(chars[n])) return n;
    var end = n;
    while (end < chars.length && MARK.test(chars[end])) end += 1;
    if (end < chars.length) return end;
    var start = n;
    while (start > 0 && MARK.test(chars[start - 1])) start -= 1;
    return start - 1;
  }

  // Decorate one run of plain text. Pure, string in and string out, so the whole
  // algorithm is testable with no DOM. `start` continues the document-wide word
  // count — that is what keeps the saccade rhythm regular across text nodes
  // instead of restarting at every paragraph.
  function decorate(text, strength, freq, start) {
    var out = '';
    var last = 0;
    var i = start || 0;
    var m;
    WORD.lastIndex = 0;
    while ((m = WORD.exec(text)) !== null) {
      var word = m[0];
      out += escapeHtml(text.slice(last, m.index));
      var n = shouldBold(i, freq) ? bionicWord(word, strength) : 0;
      var chars;
      if (n > 0) {
        // Slice by code point, not UTF-16 code unit: word.slice(0, n) would
        // cut a surrogate pair in half for an astral character.
        chars = Array.from(word);
        n = markSafeSplit(chars, n);
      }
      if (n > 0) {
        var head = chars.slice(0, n).join('');
        var tail = chars.slice(n).join('');
        out += '<b class="bx-b">' + escapeHtml(head) + '</b>' + escapeHtml(tail);
      } else {
        out += escapeHtml(word);
      }
      last = m.index + word.length;
      i += 1;
    }
    out += escapeHtml(text.slice(last));
    return { html: out, next: i };
  }

  var STORAGE_KEY = 'guide-manager:bionic';
  var DEFAULTS = { on: false, strength: 0.5, freq: 1 };
  // Headings are already bold, so there is no fixation contrast left to add
  // (h5/h6 included: visuals.md has the generator demote every heading level
  // by one, so a chapter's #### lands as h5); code is where mid-word bolding
  // actively hurts. script/style/noscript never render as reader-facing
  // text, and rewriting a textarea's value would destroy it, not decorate it.
  var SKIP = 'pre, code, kbd, svg, script, style, noscript, textarea, h1, h2, h3, h4, h5, h6, nav.toc, .bx-panel';

  function readState() {
    try {
      var raw = globalThis.localStorage.getItem(STORAGE_KEY);
      if (!raw) return { on: DEFAULTS.on, strength: DEFAULTS.strength, freq: DEFAULTS.freq };
      var s = JSON.parse(raw);
      var strength = typeof s.strength === 'number' && s.strength >= 0.2 && s.strength <= 0.8
        ? s.strength : DEFAULTS.strength;
      var freq = Number.isInteger(s.freq) && s.freq >= 1 && s.freq <= 5 ? s.freq : DEFAULTS.freq;
      return { on: s.on === true, strength: strength, freq: freq };
    } catch (e) {
      // A corrupt key, or storage blocked entirely, must never take the page's
      // other inline scripts down with it.
      return { on: DEFAULTS.on, strength: DEFAULTS.strength, freq: DEFAULTS.freq };
    }
  }

  function writeState(state) {
    try {
      globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) { /* private mode, quota, or no storage at all — not fatal */ }
  }

  function eligible(node) {
    if (!node.nodeValue || !node.nodeValue.trim()) return false;
    var el = node.parentElement;
    return !!el && !el.closest(SKIP);
  }

  // Put the page back to plain text nodes. Every decorated run kept its source
  // on data-bx-src, so this is lossless and re-running apply() after it starts
  // from clean text rather than from already-bolded markup.
  function restore(root) {
    var doc = root.ownerDocument;
    var spans = root.querySelectorAll('span.bx');
    for (var i = 0; i < spans.length; i++) {
      var span = spans[i];
      var parent = span.parentNode;
      parent.replaceChild(doc.createTextNode(span.getAttribute('data-bx-src')), span);
      parent.normalize();
    }
  }

  function apply(root, strength, freq) {
    restore(root);
    var doc = root.ownerDocument;
    var walker = doc.createTreeWalker(root, 4 /* NodeFilter.SHOW_TEXT */);
    var nodes = [];
    var node;
    // Collect first: replacing nodes while walking invalidates the walker.
    while ((node = walker.nextNode()) !== null) {
      if (eligible(node)) nodes.push(node);
    }
    var index = 0;
    for (var i = 0; i < nodes.length; i++) {
      var text = nodes[i].nodeValue;
      var res = decorate(text, strength, freq, index);
      index = res.next;
      var span = doc.createElement('span');
      span.className = 'bx';
      span.setAttribute('data-bx-src', text);
      span.innerHTML = res.html;
      nodes[i].parentNode.replaceChild(span, nodes[i]);
    }
  }

  function ordinal(n) {
    return n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : n + 'th';
  }

  // init() is both auto-invoked below and exported on __bionic, so a caller
  // can trigger it a second time; this keeps that idempotent.
  var bound = false;

  function init() {
    var doc = globalThis.document;
    if (!doc) return;
    var root = doc.querySelector('.wrap') || doc.querySelector('.shell') || doc.body;
    if (!root) return;
    if (bound) return; // already wired up; a second call must not double-bind every listener
    bound = true;

    var state = readState();

    // The control panel is optional, and that is the whole difference from v2.
    // A guide's own build vendors the panel markup, but guide-manager splices
    // this script into guides that have none: a build generated before the aid
    // existed, and a tutor deck, which has no sidebar to hang a panel off. There
    // the app's Settings page is the only control, and the `storage` listener
    // below is how it reaches this document. Bailing out on a missing panel — as
    // v2 did — would mean those guides silently never decorate at all.
    var panel = doc.querySelector('.bx-panel');
    var onBox = doc.getElementById('bx-on');
    var strengthEl = doc.getElementById('bx-strength');
    var freqEl = doc.getElementById('bx-freq');
    var opts = doc.getElementById('bx-opts');
    var strengthOut = doc.getElementById('bx-strength-out');
    var freqOut = doc.getElementById('bx-freq-out');
    var moreBtn = panel && panel.querySelector('.bx-more');
    // All or nothing: a half-present panel is a broken build, and wiring up the
    // half that exists would put controls on screen that do not work.
    var hasPanel = !!(panel && onBox && strengthEl && freqEl && opts && strengthOut && freqOut && moreBtn);

    function paint() {
      if (state.on) apply(root, state.strength, state.freq);
      else restore(root);
    }

    function render() {
      if (!hasPanel) return;
      strengthOut.textContent = strengthEl.value + '%';
      var freqWord = ordinal(Number(freqEl.value));
      freqOut.textContent = freqWord;
      freqEl.setAttribute('aria-valuetext', freqWord + ' word');
      strengthEl.disabled = !onBox.checked;
      freqEl.disabled = !onBox.checked;
    }

    function syncControls() {
      if (!hasPanel) return;
      onBox.checked = state.on;
      strengthEl.value = String(Math.round(state.strength * 100));
      freqEl.value = String(state.freq);
    }

    if (hasPanel) {
      syncControls();

      // A full guide is ~15k spans, so a rebuild per drag frame stutters: the
      // readout follows `input`, the rewrite waits for `change`.
      var commit = function () {
        state = {
          on: onBox.checked,
          strength: Number(strengthEl.value) / 100,
          freq: Number(freqEl.value),
        };
        writeState(state);
        render();
        paint();
      };

      onBox.addEventListener('change', commit);
      strengthEl.addEventListener('change', commit);
      freqEl.addEventListener('change', commit);
      strengthEl.addEventListener('input', render);
      freqEl.addEventListener('input', render);
      moreBtn.addEventListener('click', function () {
        var open = moreBtn.getAttribute('aria-expanded') === 'true';
        moreBtn.setAttribute('aria-expanded', String(!open));
        opts.hidden = open;
      });
    }

    // The central Settings page lives in another document — the app shell, which
    // may be framing this very guide. localStorage is per-origin, so a write
    // there raises a `storage` event here, and that is what lets an
    // already-open guide repaint instead of waiting for a reload. Reads the key
    // rather than the event's newValue: readState() is the one place the stored
    // shape is validated, and a hand-edited value must fall back the same way on
    // this path as on every other. A panel, where one exists, keeps working as a
    // local override — it writes the same key, so both routes converge on one
    // state, and syncing the controls here stops the panel from showing a stale
    // value and silently undoing the change on its next commit().
    //
    // Guarded on the function's existence because the panel-less path reaches
    // this line on documents v2 bailed out of well before it — including a host
    // that provides a `document` and nothing else.
    if (typeof globalThis.addEventListener === 'function') {
      globalThis.addEventListener('storage', function (e) {
        if (e.key !== STORAGE_KEY) return;
        state = readState();
        syncControls();
        render();
        paint();
      });
    }

    render();
    if (state.on) apply(root, state.strength, state.freq);
  }

  if (globalThis.document) {
    if (globalThis.document.readyState === 'loading') {
      globalThis.document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  }

  globalThis.__bionic = {
    bionicWord: bionicWord,
    shouldBold: shouldBold,
    decorate: decorate,
    readState: readState,
    apply: apply,
    restore: restore,
    init: init,
  };
})();
