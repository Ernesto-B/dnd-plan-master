/**
 * WikiLinks — renders Obsidian-style [[Entity Name]] / [[Entity Name|Display Text]]
 * references as clickable links to the matching session, encounter, NPC, or location.
 *
 * Usage:
 *   await WikiLinks.preload();                 // once, before first render
 *   WikiLinks.render(rawProseText)              // HTML-escapes + linkifies, for <p> content
 *   WikiLinks.preprocessMarkdown(rawMarkdown)   // linkifies before marked.parse(), for markdown content
 */
(function () {
  let cachedIndex = new Map();
  let loadPromise = null;

  const WIKI_LINK_RE = /\[\[([^\[\]|]+?)(?:\|([^\[\]]+?))?\]\]/g;

  function escHtml(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
  }

  // escHtml leaves quotes untouched (safe for text nodes, not for "..."-quoted
  // attributes) — NPC/location subtitles routinely contain quoted dialogue, so
  // attribute values need their own escaping pass.
  function escAttr(str) {
    return escHtml(str).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function buildIndex(nodes) {
    const byName = new Map();
    for (const node of nodes || []) {
      const name = (node.label || '').trim().toLowerCase();
      if (name && !byName.has(name)) byName.set(name, node);
    }
    return byName;
  }

  function preload() {
    if (!loadPromise) {
      loadPromise = fetch('/api/search/entity-graph')
        .then(res => (res.ok ? res.json() : { nodes: [] }))
        .then(data => {
          cachedIndex = buildIndex(data.nodes);
          return cachedIndex;
        })
        .catch(() => cachedIndex);
    }
    return loadPromise;
  }

  function linkFor(target, display) {
    const node = cachedIndex.get(target.trim().toLowerCase());
    if (node) {
      const tooltip = node.subtitle || `Open ${node.label}`;
      return `<a class="wiki-link" href="${escAttr(node.url)}" data-tooltip="${escAttr(tooltip)}">${escHtml(display)}</a>`;
    }
    return `<span class="wiki-link wiki-link-unresolved" data-tooltip="${escAttr(`No matching entity named “${target.trim()}”`)}">${escHtml(display)}</span>`;
  }

  function render(raw) {
    const text = raw == null ? '' : String(raw);
    if (!text.includes('[[')) return escHtml(text);

    let out = '';
    let lastIndex = 0;
    WIKI_LINK_RE.lastIndex = 0;
    let match;
    while ((match = WIKI_LINK_RE.exec(text))) {
      out += escHtml(text.slice(lastIndex, match.index));
      const target = match[1];
      const display = (match[2] || match[1]).trim();
      out += linkFor(target, display);
      lastIndex = WIKI_LINK_RE.lastIndex;
    }
    out += escHtml(text.slice(lastIndex));
    return out;
  }

  function preprocessMarkdown(raw) {
    const text = raw == null ? '' : String(raw);
    if (!text.includes('[[')) return text;
    return text.replace(WIKI_LINK_RE, (full, target, display) => linkFor(target, (display || target).trim()));
  }

  // ─── Fuzzy search ───────────────────────────────────────────────────────────
  // Ranks prefix matches highest, then substring matches (earlier = better),
  // then in-order subsequence matches (Obsidian-style "type the letters in order").

  function fuzzyScore(query, text) {
    const q = query.toLowerCase();
    const t = text.toLowerCase();
    if (!q) return 1;
    const idx = t.indexOf(q);
    if (idx === 0) return 300 - t.length;
    if (idx > 0) return 200 - idx;
    let qi = 0;
    for (let ti = 0; ti < t.length && qi < q.length; ti++) {
      if (t[ti] === q[qi]) qi++;
    }
    return qi === q.length ? 100 - t.length : -1;
  }

  function search(query, limit = 8) {
    const q = (query || '').trim();
    const scored = [];
    for (const node of cachedIndex.values()) {
      const score = fuzzyScore(q, node.label || '');
      if (score > 0) scored.push({ node, score });
    }
    scored.sort((a, b) => b.score - a.score || (a.node.label || '').localeCompare(b.node.label || ''));
    return scored.slice(0, limit).map(s => s.node);
  }

  // ─── Caret coordinates ──────────────────────────────────────────────────────
  // Mirrors the textarea's text into an offscreen div with identical font metrics
  // so we can read back the pixel position of an arbitrary character offset.

  const MIRROR_PROPS = [
    'boxSizing', 'width', 'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
    'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
    'fontStyle', 'fontVariant', 'fontWeight', 'fontStretch', 'fontSize', 'lineHeight', 'fontFamily',
    'textAlign', 'textTransform', 'textIndent', 'letterSpacing', 'wordSpacing', 'tabSize',
    'whiteSpace', 'wordWrap', 'wordBreak',
  ];

  function getCaretCoordinates(el, position) {
    const div = document.createElement('div');
    const computed = getComputedStyle(el);
    const style = div.style;

    style.position = 'absolute';
    style.visibility = 'hidden';
    style.whiteSpace = 'pre-wrap';
    style.wordWrap = 'break-word';
    MIRROR_PROPS.forEach(prop => { style[prop] = computed[prop]; });

    document.body.appendChild(div);
    div.textContent = el.value.substring(0, position);

    const span = document.createElement('span');
    span.textContent = el.value.substring(position) || '.';
    div.appendChild(span);

    const rect = el.getBoundingClientRect();
    const coords = {
      top: rect.top + span.offsetTop - el.scrollTop,
      left: rect.left + span.offsetLeft - el.scrollLeft,
      height: parseInt(computed.lineHeight, 10) || span.offsetHeight,
    };

    document.body.removeChild(div);
    return coords;
  }

  // ─── Autocomplete ───────────────────────────────────────────────────────────
  // Obsidian-style "[[" trigger: type "[[Sal" and a fuzzy-matched dropdown of
  // entity names appears under the caret; Tab/Enter completes "[[Saltmere Docks]]".

  const wired = new WeakSet();
  let activeMenu = null;

  function closeMenu() {
    if (activeMenu) {
      activeMenu.el.remove();
      document.removeEventListener('mousedown', activeMenu.onDocMouseDown, true);
      activeMenu = null;
    }
  }

  function findOpenBracket(value, cursor) {
    const before = value.slice(0, cursor);
    const idx = before.lastIndexOf('[[');
    if (idx === -1) return -1;
    const between = value.slice(idx + 2, cursor);
    if (between.includes(']]') || between.includes('[[') || between.includes('\n')) return -1;
    return idx;
  }

  function openMenuFor(target, openStart) {
    closeMenu();

    const menuEl = document.createElement('div');
    menuEl.className = 'wiki-autocomplete-menu';
    document.body.appendChild(menuEl);

    const state = { el: menuEl, target, openStart, items: [], activeIndex: 0, onDocMouseDown: null };
    activeMenu = state;

    state.onDocMouseDown = (e) => {
      if (!menuEl.contains(e.target) && e.target !== target) closeMenu();
    };
    document.addEventListener('mousedown', state.onDocMouseDown, true);

    menuEl.addEventListener('mousedown', (e) => {
      e.preventDefault(); // keep textarea focused
      const item = e.target.closest('.wiki-autocomplete-item');
      if (item) applySelection(state, Number(item.dataset.index));
    });

    return state;
  }

  function renderMenu(state) {
    const { el, items, activeIndex } = state;
    if (!items.length) { closeMenu(); return; }

    el.innerHTML = items.map((node, i) => `
      <div class="wiki-autocomplete-item${i === activeIndex ? ' active' : ''}" data-index="${i}">
        <span class="wiki-autocomplete-label">${escHtml(node.label)}</span>
        <span class="wiki-autocomplete-type">${escHtml(node.entityType || '')}</span>
      </div>
    `).join('');

    const coords = getCaretCoordinates(state.target, state.openStart);
    el.style.left = `${coords.left}px`;
    el.style.top = `${coords.top + coords.height + 4}px`;
  }

  function applySelection(state, index) {
    const node = state.items[index];
    if (!node) return;
    const el = state.target;
    const value = el.value;
    const cursor = el.selectionStart;
    const before = value.slice(0, state.openStart);
    const after = value.slice(cursor);
    const insertion = `[[${node.label}]]`;
    el.value = before + insertion + after;
    const newCursor = before.length + insertion.length;
    el.setSelectionRange(newCursor, newCursor);
    el.focus();
    el.dispatchEvent(new Event('input', { bubbles: true }));
    closeMenu();
  }

  function refreshMenu(el) {
    const cursor = el.selectionStart;
    const openStart = findOpenBracket(el.value, cursor);
    if (openStart === -1) { closeMenu(); return; }

    const query = el.value.slice(openStart + 2, cursor);
    const items = search(query);
    if (!items.length) { closeMenu(); return; }

    if (!activeMenu || activeMenu.target !== el || activeMenu.openStart !== openStart) {
      openMenuFor(el, openStart);
    }
    activeMenu.items = items;
    activeMenu.activeIndex = Math.min(activeMenu.activeIndex, items.length - 1);
    renderMenu(activeMenu);
  }

  function attachAutocomplete(el) {
    if (!el || wired.has(el)) return;
    wired.add(el);

    el.addEventListener('input', () => refreshMenu(el));
    el.addEventListener('click', () => { if (activeMenu && activeMenu.target === el) refreshMenu(el); });

    el.addEventListener('keydown', (e) => {
      if (!activeMenu || activeMenu.target !== el) return;
      const { items } = activeMenu;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        activeMenu.activeIndex = (activeMenu.activeIndex + 1) % items.length;
        renderMenu(activeMenu);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        activeMenu.activeIndex = (activeMenu.activeIndex - 1 + items.length) % items.length;
        renderMenu(activeMenu);
      } else if (e.key === 'Tab' || e.key === 'Enter') {
        e.preventDefault();
        applySelection(activeMenu, activeMenu.activeIndex);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        closeMenu();
      }
    });

    el.addEventListener('blur', () => {
      setTimeout(() => { if (activeMenu && activeMenu.target === el) closeMenu(); }, 120);
    });
  }

  function enableAutocomplete(selector = 'textarea, input[type="text"]') {
    preload();
    document.addEventListener('focusin', (e) => {
      if (e.target.matches && e.target.matches(selector)) attachAutocomplete(e.target);
    });
    document.querySelectorAll(selector).forEach(attachAutocomplete);
  }

  window.WikiLinks = { preload, render, preprocessMarkdown, escHtml, search, enableAutocomplete };
})();
