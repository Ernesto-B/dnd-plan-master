(function () {
  // ─── State ──────────────────────────────────────────────────────────────────
  let cfg        = null;
  let ctxId      = null;
  let selectMode = false;
  let selectedIds = new Set();
  let menuX = 0, menuY = 0;

  // ─── Build shared DOM (once, appended to body) ──────────────────────────────
  const menu = document.createElement('div');
  menu.id = 'ctx-menu';
  menu.className = 'ctx-menu';
  menu.innerHTML = `
    <div class="ctx-menu-header">
      <span class="ctx-menu-id" id="ctx-id-text"></span>
      <button class="ctx-copy-btn" id="ctx-copy-btn">Copy</button>
    </div>
    <button class="ctx-item" id="ctx-select">☐  Select</button>
    <button class="ctx-item" id="ctx-export">↓  Export JSON</button>
    <button class="ctx-item" id="ctx-tag">🏷  Tag…</button>
    <button class="ctx-item ctx-item-danger" id="ctx-delete">✕  Delete</button>`;
  document.body.appendChild(menu);

  const tagPanel = document.createElement('div');
  tagPanel.id = 'ctx-tag-panel';
  tagPanel.className = 'ctx-tag-panel';
  tagPanel.innerHTML = `
    <div class="ctx-tag-panel-head">
      <span id="ctx-tag-panel-title">Edit Tags</span>
      <button class="ctx-tag-close" id="ctx-tag-close">✕</button>
    </div>
    <div id="ctx-tag-input-wrap" class="ctx-tag-input-wrap"></div>
    <p class="ctx-tag-hint" id="ctx-tag-hint"></p>
    <div class="ctx-tag-panel-footer">
      <button class="btn btn-primary" id="ctx-tag-apply">Apply</button>
    </div>`;
  document.body.appendChild(tagPanel);

  // ─── Dismiss on outside click / Escape ──────────────────────────────────────
  document.addEventListener('click', (e) => {
    if (menu.classList.contains('visible') && !menu.contains(e.target)) hideMenu();
    if (tagPanel.classList.contains('visible') && !tagPanel.contains(e.target) && !menu.contains(e.target)) hideTagPanel();
  }, true);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { hideMenu(); hideTagPanel(); }
  });

  // ─── Menu button wiring ──────────────────────────────────────────────────────
  document.getElementById('ctx-copy-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(ctxId).then(() => {
      const btn = document.getElementById('ctx-copy-btn');
      btn.textContent = 'Copied!';
      setTimeout(() => { btn.textContent = 'Copy'; }, 1500);
    }).catch(() => {});
  });

  document.getElementById('ctx-select').addEventListener('click', () => {
    hideMenu();
    if (!selectMode) enterSelectMode();
    toggleRow(ctxId, true);
  });

  document.getElementById('ctx-export').addEventListener('click', () => {
    hideMenu();
    exportItems([ctxId]);
  });

  document.getElementById('ctx-tag').addEventListener('click', () => {
    hideMenu();
    const item = cfg.getAllItems().find(i => i.id === ctxId);
    openTagPanel([ctxId], item ? (item.tags || []) : [], false);
  });

  document.getElementById('ctx-delete').addEventListener('click', () => {
    hideMenu();
    deleteItems([ctxId]);
  });

  // ─── Tag panel wiring ────────────────────────────────────────────────────────
  document.getElementById('ctx-tag-close').addEventListener('click', () => hideTagPanel());
  document.getElementById('ctx-tag-apply').addEventListener('click', () => applyTags());

  // ─── Public API ──────────────────────────────────────────────────────────────
  window.initContextMenu = function (config) {
    cfg = config;
    buildToolbar();

    const container = document.getElementById(cfg.containerId);
    if (!container) return;

    // Right-click → show menu
    container.addEventListener('contextmenu', (e) => {
      const row = e.target.closest('.session-row');
      if (!row) return;
      e.preventDefault();
      ctxId = row.dataset.id;
      showMenu(e.clientX, e.clientY);
    });

    // Clicks in select mode toggle checkboxes; otherwise let clickable TDs navigate
    container.addEventListener('click', (e) => {
      if (!selectMode) return;
      if (e.target.classList.contains('row-checkbox')) {
        // native checkbox click — just sync state
        updateSelection();
        return;
      }
      if (e.target.closest('.action-cell')) return;
      const row = e.target.closest('.session-row');
      if (row) {
        const cb = row.querySelector('.row-checkbox');
        if (cb) { cb.checked = !cb.checked; updateSelection(); }
      }
    });
  };

  window.isMultiSelectMode = () => selectMode;

  window.exitSelectMode = function () {
    if (!selectMode) return;
    selectMode = false;
    selectedIds.clear();
    const container = cfg && document.getElementById(cfg.containerId);
    if (container) {
      container.classList.remove('multiselect-mode');
      container.querySelectorAll('.row-checkbox').forEach(cb => { cb.checked = false; });
      container.querySelectorAll('.session-row.ctx-selected').forEach(r => r.classList.remove('ctx-selected'));
    }
    const toolbar = document.getElementById('ms-toolbar');
    if (toolbar) toolbar.classList.remove('visible');
  };

  // ─── Menu show / hide ────────────────────────────────────────────────────────
  function showMenu(x, y) {
    document.getElementById('ctx-id-text').textContent = ctxId;
    document.getElementById('ctx-copy-btn').textContent = 'Copy';
    menu.style.left = '-9999px';
    menu.style.top  = '-9999px';
    menu.classList.add('visible');
    const mw = menu.offsetWidth, mh = menu.offsetHeight;
    const vw = window.innerWidth,  vh = window.innerHeight;
    menuX = Math.min(x + 4, vw - mw - 8);
    menuY = Math.min(y + 4, vh - mh - 8);
    menu.style.left = `${menuX}px`;
    menu.style.top  = `${menuY}px`;
  }

  function hideMenu() { menu.classList.remove('visible'); }

  // ─── Toolbar ─────────────────────────────────────────────────────────────────
  function buildToolbar() {
    const wrap = document.getElementById('ms-toolbar');
    if (!wrap) return;
    wrap.innerHTML = `
      <span class="ms-count" id="ms-count">0 selected</span>
      <button class="btn btn-ghost ms-btn" id="ms-delete" disabled>Delete</button>
      <button class="btn btn-ghost ms-btn" id="ms-export" disabled>Export JSON</button>
      <button class="btn btn-ghost ms-btn" id="ms-tag" disabled>Tag…</button>
      <button class="btn btn-ghost ms-exit" id="ms-exit">✕ Exit Selection</button>`;

    document.getElementById('ms-delete').addEventListener('click', () => deleteItems([...selectedIds]));
    document.getElementById('ms-export').addEventListener('click', () => exportItems([...selectedIds]));
    document.getElementById('ms-tag').addEventListener('click', () => openTagPanel([...selectedIds], [], true));
    document.getElementById('ms-exit').addEventListener('click', () => window.exitSelectMode());
  }

  function enterSelectMode() {
    selectMode = true;
    const container = document.getElementById(cfg.containerId);
    if (container) container.classList.add('multiselect-mode');
    const toolbar = document.getElementById('ms-toolbar');
    if (toolbar) toolbar.classList.add('visible');
  }

  function toggleRow(id, forceOn) {
    const container = document.getElementById(cfg.containerId);
    if (!container) return;
    const row = container.querySelector(`.session-row[data-id="${CSS.escape(id)}"]`);
    if (!row) return;
    const cb = row.querySelector('.row-checkbox');
    if (cb) {
      cb.checked = forceOn !== undefined ? forceOn : !cb.checked;
      updateSelection();
    }
  }

  function updateSelection() {
    const container = document.getElementById(cfg.containerId);
    if (!container) return;
    selectedIds.clear();
    container.querySelectorAll('.row-checkbox').forEach(cb => {
      const row = cb.closest('.session-row');
      if (!row) return;
      if (cb.checked) { selectedIds.add(row.dataset.id); row.classList.add('ctx-selected'); }
      else { row.classList.remove('ctx-selected'); }
    });
    const n = selectedIds.size;
    const countEl = document.getElementById('ms-count');
    if (countEl) countEl.textContent = `${n} selected`;
    ['ms-delete', 'ms-export', 'ms-tag'].forEach(btnId => {
      const btn = document.getElementById(btnId);
      if (btn) btn.disabled = n === 0;
    });
  }

  // ─── Delete ──────────────────────────────────────────────────────────────────
  async function deleteItems(ids) {
    if (!ids.length) return;
    const label = ids.length === 1 ? `"${ids[0]}"` : `${ids.length} items`;
    const ok = await showConfirm(`Delete ${label}? This cannot be undone.`, {
      title: 'Delete',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;

    let failed = 0;
    for (const id of ids) {
      try {
        const res = await fetch(`${cfg.apiBase}/${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error();
        const container = document.getElementById(cfg.containerId);
        const row = container && container.querySelector(`.session-row[data-id="${CSS.escape(id)}"]`);
        if (row) row.remove();
        if (cfg.onDelete) cfg.onDelete(id);
      } catch { failed++; }
    }

    if (selectMode) window.exitSelectMode();
    const done = ids.length - failed;
    if (failed) toast(`Failed to delete ${failed} item(s).`, 'error');
    else toast(`Deleted ${done} item(s).`, 'success');
  }

  // ─── Export ──────────────────────────────────────────────────────────────────
  async function exportItems(ids) {
    if (!ids.length) return;
    try {
      const res = await fetch('/api/settings/export-data');
      if (!res.ok) throw new Error('Could not fetch data');
      const all = await res.json();
      const idSet = new Set(ids);
      const payload = cfg.type === 'session'
        ? { sessions: all.sessions.filter(s => idSet.has(s.id)), encounters: [] }
        : { sessions: [], encounters: all.encounters.filter(e => idSet.has(e.id)) };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `dnd-export-${ids.length === 1 ? ids[0] : 'bulk'}-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast(`Exported ${ids.length} item(s).`, 'success');
    } catch (err) {
      toast('Export failed: ' + err.message, 'error');
    }
  }

  // ─── Tag panel ───────────────────────────────────────────────────────────────
  let tagPanelTi   = null;
  let tagPanelIds  = [];
  let tagPanelBulk = false;

  function openTagPanel(ids, initialTags, isBulk) {
    tagPanelIds  = ids;
    tagPanelBulk = isBulk;

    const wrap = document.getElementById('ctx-tag-input-wrap');
    wrap.innerHTML = '';
    tagPanelTi = new TagInput(wrap, initialTags);

    document.getElementById('ctx-tag-panel-title').textContent =
      isBulk ? `Add Tags to ${ids.length} Item(s)` : 'Edit Tags';
    document.getElementById('ctx-tag-hint').textContent =
      isBulk ? 'Tags are merged with each item\'s existing tags.' : '';

    // Position near last menu position
    const vw = window.innerWidth, vh = window.innerHeight;
    tagPanel.style.left = '-9999px';
    tagPanel.style.top  = '-9999px';
    tagPanel.classList.add('visible');
    const pw = tagPanel.offsetWidth, ph = tagPanel.offsetHeight;
    tagPanel.style.left = `${Math.min(menuX, vw - pw - 12)}px`;
    tagPanel.style.top  = `${Math.min(menuY, vh - ph - 12)}px`;
  }

  function hideTagPanel() {
    tagPanel.classList.remove('visible');
    tagPanelIds = [];
    tagPanelTi  = null;
  }

  async function applyTags() {
    if (!tagPanelTi || !tagPanelIds.length) return;
    const newTags = tagPanelTi.getTags();
    const applyBtn = document.getElementById('ctx-tag-apply');
    applyBtn.disabled = true;
    applyBtn.textContent = 'Saving…';

    let ok = 0;
    for (const id of tagPanelIds) {
      try {
        let tags = newTags;
        if (tagPanelBulk) {
          const item = cfg.getAllItems().find(i => i.id === id);
          const existing = item ? (item.tags || []) : [];
          tags = [...new Set([...existing, ...newTags])];
        }
        const res = await fetch(`${cfg.apiBase}/${id}/tags`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tags }),
        });
        if (res.ok) {
          ok++;
          if (cfg.onTagsUpdate) cfg.onTagsUpdate(id, tags);
        }
      } catch {}
    }

    hideTagPanel();
    if (selectMode) window.exitSelectMode();
    applyBtn.disabled = false;
    applyBtn.textContent = 'Apply';
    toast(`Updated tags on ${ok} item(s).`, 'success');
  }

  // ─── Toast helper ────────────────────────────────────────────────────────────
  function toast(msg, type = 'success') {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.className = `toast ${type} show`;
    setTimeout(() => { t.className = 'toast'; }, 4000);
  }
})();
