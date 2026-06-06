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
        <input id="gs-input" class="gs-input" type="text" placeholder="Search sessions, encounters, NPCs…" autocomplete="off" spellcheck="false">
        <kbd class="gs-esc-hint">Esc</kbd>
      </div>
      <div class="gs-hints">
        <span class="gs-hint-chip">session: …</span>
        <span class="gs-hint-chip">enc: …</span>
        <span class="gs-hint-chip">npc: …</span>
      </div>
      <div id="gs-results" class="gs-results"></div>
    </div>`;
  document.body.appendChild(overlay);

  const input    = document.getElementById('gs-input');
  const results  = document.getElementById('gs-results');

  // ─── State ──────────────────────────────────────────────────────────────────
  let debounceTimer = null;
  let lastQuery     = '';
  let activeIdx     = -1;
  let currentItems  = [];

  const TYPE_META = {
    session:   { icon: '📜', label: 'Sessions'   },
    encounter: { icon: '⚔',  label: 'Encounters' },
    npc:       { icon: '👤', label: 'NPCs'        },
  };

  // ─── Open / close ────────────────────────────────────────────────────────────
  function open() {
    overlay.classList.add('visible');
    input.value = '';
    results.innerHTML = '';
    activeIdx = -1;
    currentItems = [];
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
  input.addEventListener('input', () => {
    const q = input.value.trim();
    if (q === lastQuery) return;
    lastQuery = q;
    activeIdx = -1;

    clearTimeout(debounceTimer);
    if (!q) { results.innerHTML = ''; currentItems = []; return; }
    debounceTimer = setTimeout(() => runSearch(q), 180);
  });

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

    const order = ['session', 'encounter', 'npc'];
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

  function escHtml(str) {
    return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
})();
