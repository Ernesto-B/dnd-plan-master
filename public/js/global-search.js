(function () {
  // ─── Inject search trigger into nav ──────────────────────────────────────────
  const nav = document.querySelector('.top-nav');
  if (!nav) return;

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.id   = 'gs-trigger';
  trigger.className = 'gs-trigger';
  trigger.innerHTML = '<span class="gs-trigger-icon">⌕</span><span class="gs-trigger-label">Search…</span><kbd class="gs-trigger-kbd">⌘O</kbd>';

  // Insert before the create-wrap
  const createWrap = nav.querySelector('.nav-create-wrap');
  nav.insertBefore(trigger, createWrap || null);

  // ─── Build overlay (once) ────────────────────────────────────────────────────
  const overlay = document.createElement('div');
  overlay.id = 'gs-overlay';
  overlay.className = 'gs-overlay';
  overlay.innerHTML = `
    <div class="gs-box" role="dialog" aria-label="Global search">
      <div class="gs-input-row">
        <span class="gs-input-icon">⌕</span>
        <input id="gs-input" class="gs-input" type="text" placeholder="Search sessions, encounters, NPCs, locations, factions…" autocomplete="off" spellcheck="false">
        <div class="gs-input-tools">
          <span id="gs-scope-indicator" class="gs-scope-indicator" hidden></span>
          <kbd class="gs-esc-hint">Esc</kbd>
        </div>
      </div>
      <div class="gs-hints">
        <span class="gs-hint-chip" data-scope="session">session: …</span>
        <span class="gs-hint-chip" data-scope="encounter">enc: …</span>
        <span class="gs-hint-chip" data-scope="npc">npc: …</span>
        <span class="gs-hint-chip" data-scope="location">loc: …</span>
        <span class="gs-hint-chip" data-scope="faction">fac: …</span>
      </div>
      <div id="gs-results" class="gs-results"></div>
    </div>`;
  document.body.appendChild(overlay);

  const input    = document.getElementById('gs-input');
  const results  = document.getElementById('gs-results');
  const scopeIndicator = document.getElementById('gs-scope-indicator');
  const hintChips = Array.from(overlay.querySelectorAll('.gs-hint-chip'));

  // ─── State ──────────────────────────────────────────────────────────────────
  let debounceTimer = null;
  let lastQuery     = '';
  let activeIdx     = -1;
  let currentItems  = [];

  const TYPE_META = {
    session:   { icon: '📜', label: 'Sessions'   },
    encounter: { icon: '⚔',  label: 'Encounters' },
    npc:       { icon: '👤', label: 'NPCs'        },
    location:  { icon: '📍', label: 'Locations'   },
    faction:   { icon: '⚑', label: 'Factions'     },
  };

  const SMART_SCOPES = [
    { key: 'session', aliases: ['session', 'sessions', 'sess'], label: 'Sessions', canonical: 'session' },
    { key: 'encounter', aliases: ['enc', 'encounter', 'encounters'], label: 'Encounters', canonical: 'enc' },
    { key: 'npc', aliases: ['npc', 'npcs'], label: 'NPCs', canonical: 'npc' },
    { key: 'location', aliases: ['loc', 'location', 'locations'], label: 'Locations', canonical: 'loc' },
    { key: 'faction', aliases: ['fac', 'faction', 'factions'], label: 'Factions', canonical: 'fac' },
  ];

  // ─── Open / close ────────────────────────────────────────────────────────────
  function open() {
    overlay.classList.add('visible');
    input.value = '';
    results.innerHTML = '';
    lastQuery = '';
    activeIdx = -1;
    currentItems = [];
    updateScopeUi('');
    input.focus();
  }

  function close() {
    overlay.classList.remove('visible');
    clearTimeout(debounceTimer);
  }

  trigger.addEventListener('click', open);

  overlay.addEventListener('click', e => {
    if (e.target === overlay) close();
  });

  // ─── Keyboard shortcut ───────────────────────────────────────────────────────
  document.addEventListener('keydown', e => {
    const isMac = navigator.platform.toUpperCase().includes('MAC');
    if ((isMac ? e.metaKey : e.ctrlKey) && e.key === 'o') {
      e.preventDefault();
      overlay.classList.contains('visible') ? close() : open();
    }
    if (!overlay.classList.contains('visible')) return;

    if (e.key === 'Escape') { close(); return; }
    if (e.key === 'Tab') {
      const completion = getScopeCompletion(input.value);
      if (completion) {
        e.preventDefault();
        input.value = completion;
        handleQueryInput();
      }
      return;
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); moveActive(1); return; }
    if (e.key === 'ArrowUp')   { e.preventDefault(); moveActive(-1); return; }
    if (e.key === 'Enter') {
      e.preventDefault();
      const active = results.querySelector('.gs-item.gs-active');
      if (active) { close(); location.href = active.dataset.url; }
      return;
    }
  });

  // ─── Search ──────────────────────────────────────────────────────────────────
  input.addEventListener('input', handleQueryInput);

  function handleQueryInput() {
    const q = input.value.trim();
    updateScopeUi(input.value);
    if (q === lastQuery) return;
    lastQuery = q;
    activeIdx = -1;

    clearTimeout(debounceTimer);
    if (!q) { results.innerHTML = ''; currentItems = []; return; }
    debounceTimer = setTimeout(() => runSearch(q), 180);
  }

  async function runSearch(q) {
    let data;
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      if (!res.ok) return;
      data = await res.json();
    } catch { return; }

    currentItems = data;
    renderResults(data);
  }

  function renderResults(items) {
    if (!items.length) {
      results.innerHTML = '<p class="gs-empty">No results found.</p>';
      return;
    }

    // Group by type
    const groups = {};
    for (const item of items) {
      if (!groups[item.type]) groups[item.type] = [];
      groups[item.type].push(item);
    }

    const order = ['session', 'encounter', 'npc', 'location', 'faction'];
    let html = '';
    let idx  = 0;

    for (const type of order) {
      const group = groups[type];
      if (!group) continue;
      const meta = TYPE_META[type];
      html += `<div class="gs-group-head">${meta.icon} ${meta.label}</div>`;
      for (const item of group) {
        html += `<a class="gs-item" href="${escHtml(item.url)}" data-url="${escHtml(item.url)}" data-idx="${idx}">
          <span class="gs-item-title">${escHtml(item.title)}</span>
          ${item.subtitle ? `<span class="gs-item-sub">${escHtml(item.subtitle)}</span>` : ''}
        </a>`;
        idx++;
      }
    }

    results.innerHTML = html;

    results.querySelectorAll('.gs-item').forEach(el => {
      el.addEventListener('mouseenter', () => setActive(Number(el.dataset.idx)));
      el.addEventListener('click', () => close());
    });
  }

  function moveActive(delta) {
    const items = Array.from(results.querySelectorAll('.gs-item'));
    if (!items.length) return;
    activeIdx = Math.max(0, Math.min(items.length - 1, activeIdx + delta));
    items.forEach((el, i) => el.classList.toggle('gs-active', i === activeIdx));
    items[activeIdx]?.scrollIntoView({ block: 'nearest' });
  }

  function setActive(idx) {
    activeIdx = idx;
    results.querySelectorAll('.gs-item').forEach((el, i) => el.classList.toggle('gs-active', i === idx));
  }

  function findScopeByAlias(alias) {
    const normalized = String(alias || '').trim().toLowerCase();
    if (!normalized) return null;
    return SMART_SCOPES.find(scope => scope.aliases.includes(normalized)) || null;
  }

  function matchScopeFragment(fragment) {
    const normalized = String(fragment || '').trim().toLowerCase();
    if (!normalized) return null;
    const matches = SMART_SCOPES.filter(scope =>
      scope.aliases.some(alias => alias.startsWith(normalized))
    );
    return matches.length === 1 ? matches[0] : null;
  }

  function parseScopePrefix(value) {
    const match = String(value || '').match(/^\s*([a-z]+)\s*:(.*)$/i);
    if (!match) return null;
    const scope = findScopeByAlias(match[1]);
    if (!scope) return null;
    return { scope, query: match[2] };
  }

  function getScopeCompletion(value) {
    const raw = String(value || '');
    const withColon = raw.match(/^(\s*)([a-z]+)\s*:(\s*)$/i);
    if (withColon) {
      const scope = matchScopeFragment(withColon[2]) || findScopeByAlias(withColon[2]);
      return scope ? `${withColon[1]}${scope.canonical}: ` : null;
    }

    const bare = raw.match(/^(\s*)([a-z]+)$/i);
    if (!bare) return null;
    const scope = matchScopeFragment(bare[2]) || findScopeByAlias(bare[2]);
    return scope ? `${bare[1]}${scope.canonical}: ` : null;
  }

  function updateScopeUi(value) {
    const parsed = parseScopePrefix(value);
    const activeScope = parsed?.scope?.key || null;

    overlay.classList.toggle('gs-has-scope', Boolean(activeScope));
    scopeIndicator.hidden = !activeScope;
    scopeIndicator.textContent = activeScope ? `Scoped: ${parsed.scope.label}` : '';

    hintChips.forEach(chip => {
      chip.classList.toggle('is-active', chip.dataset.scope === activeScope);
    });
  }

  function escHtml(str) {
    return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
})();
