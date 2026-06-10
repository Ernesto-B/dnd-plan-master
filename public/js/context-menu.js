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
    <button class="ctx-item" id="ctx-archive">🗄  Archive</button>
    <button class="ctx-item" id="ctx-duplicate">⧉  Duplicate</button>
    <button class="ctx-item" id="ctx-export">↓  Export JSON</button>
    <button class="ctx-item" id="ctx-tag">🏷  Tag…</button>
    <button class="ctx-item ctx-item-danger" id="ctx-delete">🗑  Move to Trash</button>`;
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

  document.getElementById('ctx-duplicate').addEventListener('click', () => {
    hideMenu();
    duplicateItem(ctxId);
  });

  document.getElementById('ctx-archive').addEventListener('click', () => {
    hideMenu();
    changeStatus([ctxId], 'archived');
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
    trashItems([ctxId]);
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

    // ⋮ button → open context menu at button position
    container.addEventListener('click', (e) => {
      const moreBtn = e.target.closest('.btn-more-row');
      if (moreBtn) {
        e.stopPropagation();
        ctxId = moreBtn.dataset.id;
        const rect = moreBtn.getBoundingClientRect();
        showMenu(rect.right, rect.bottom + 2);
        return;
      }
      if (e.target.classList.contains('select-all-checkbox')) {
        setAllVisibleSelection(e.target.checked);
        return;
      }
      if (!selectMode) return;
      if (e.target.classList.contains('row-checkbox')) {
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
    document.getElementById('ctx-archive').hidden = !cfg?.allowArchive;
    document.getElementById('ctx-duplicate').hidden = !cfg?.duplicate;
    menu.style.left = '-9999px';
    menu.style.top  = '-9999px';
    menu.classList.add('visible');
    const mw = menu.offsetWidth, mh = menu.offsetHeight;
    const vw = window.innerWidth,  vh = window.innerHeight;
    const pad = 8;

    // Prefer right; flip left if it would overflow
    let left = x + 4;
    if (left + mw > vw - pad) left = x - mw - 4;
    left = Math.max(pad, Math.min(left, vw - mw - pad));

    // Prefer below; flip above if it would overflow
    let top = y + 4;
    if (top + mh > vh - pad) top = y - mh - 4;
    top = Math.max(pad, Math.min(top, vh - mh - pad));

    menuX = left;
    menuY = top;
    menu.style.left = `${left}px`;
    menu.style.top  = `${top}px`;
  }

  function hideMenu() { menu.classList.remove('visible'); }

  // ─── Toolbar ─────────────────────────────────────────────────────────────────
  function buildToolbar() {
    const wrap = document.getElementById('ms-toolbar');
    if (!wrap) return;
    wrap.innerHTML = `
      <span class="ms-count" id="ms-count">0 selected</span>
      <button class="btn btn-ghost ms-btn" id="ms-select-all">Select All Visible</button>
      <button class="btn btn-ghost ms-btn" id="ms-clear-all">Clear Visible</button>
      <button class="btn btn-ghost ms-btn" id="ms-archive" disabled>Archive</button>
      <button class="btn btn-ghost ms-btn" id="ms-delete" disabled>Move to Trash</button>
      <button class="btn btn-ghost ms-btn" id="ms-export" disabled>Export JSON</button>
      <button class="btn btn-ghost ms-btn" id="ms-tag" disabled>Tag…</button>
      <button class="btn btn-ghost ms-exit" id="ms-exit">✕ Exit Selection</button>`;

    document.getElementById('ms-select-all').addEventListener('click', () => setAllVisibleSelection(true));
    document.getElementById('ms-clear-all').addEventListener('click', () => setAllVisibleSelection(false));
    document.getElementById('ms-archive').addEventListener('click', () => changeStatus([...selectedIds], 'archived'));
    document.getElementById('ms-delete').addEventListener('click', () => trashItems([...selectedIds]));
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

  function setAllVisibleSelection(checked) {
    const container = document.getElementById(cfg.containerId);
    if (!container) return;
    if (checked && !selectMode) enterSelectMode();
    container.querySelectorAll('.session-row .row-checkbox').forEach(cb => {
      cb.checked = checked;
    });
    updateSelection();
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
    ['ms-archive', 'ms-delete', 'ms-export', 'ms-tag'].forEach(btnId => {
      const btn = document.getElementById(btnId);
      if (btn) btn.disabled = n === 0;
    });

    const rowCheckboxes = [...container.querySelectorAll('.session-row .row-checkbox')];
    const selectAll = container.querySelector('.select-all-checkbox');
    if (selectAll) {
      const total = rowCheckboxes.length;
      const checkedCount = rowCheckboxes.filter(cb => cb.checked).length;
      selectAll.checked = total > 0 && checkedCount === total;
      selectAll.indeterminate = checkedCount > 0 && checkedCount < total;
    }
  }

  async function trashItems(ids) {
    if (!ids.length) return;
    const label = ids.length === 1 ? `"${ids[0]}"` : `${ids.length} items`;
    const ok = await showConfirm(`Move ${label} to trash? You can restore it later from Settings.`, {
      title: 'Move to Trash',
      confirmLabel: 'Move to Trash',
      danger: true,
    });
    if (!ok) return;
    await changeStatus(ids, 'trashed', { skipConfirm: true });
  }

  async function changeStatus(ids, status, options = {}) {
    if (!ids.length) return;
    let failed = 0;
    const changedIds = [];
    for (const id of ids) {
      try {
        const res = await fetch(`${cfg.apiBase}/${id}/state`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status }),
        });
        if (!res.ok) throw new Error();
        const container = document.getElementById(cfg.containerId);
        const row = container && container.querySelector(`.session-row[data-id="${CSS.escape(id)}"]`);
        if (row) row.remove();
        if (cfg.onDelete) cfg.onDelete(id);
        changedIds.push(id);
      } catch { failed++; }
    }

    if (selectMode) window.exitSelectMode();
    const done = ids.length - failed;
    if (failed) {
      toast(`Failed to update ${failed} item(s).`, 'error');
      return;
    }
    const statusLabel = status === 'archived' ? 'Archived' : 'Moved to trash';
    toastWithAction(`${statusLabel} ${done} item${done === 1 ? '' : 's'}.`, 'success', 'Undo', () => restoreItems(changedIds));
  }

  // ─── Export ──────────────────────────────────────────────────────────────────
  async function exportItems(ids) {
    if (!ids.length) return;
    try {
      const res = await fetch('/api/settings/export-data');
      if (!res.ok) throw new Error('Could not fetch data');
      const all = await res.json();
      const idSet = new Set(ids);
      const payload = {
        sessions: cfg.type === 'session' ? all.sessions.filter(s => idSet.has(s.id)) : [],
        encounters: cfg.type === 'encounter' ? all.encounters.filter(e => idSet.has(e.id)) : [],
        npcs: cfg.type === 'npc' ? (all.npcs || []).filter(n => idSet.has(n.id)) : [],
        locations: cfg.type === 'location' ? (all.locations || []).filter(l => idSet.has(l.id)) : [],
        factions: cfg.type === 'faction' ? (all.factions || []).filter(f => idSet.has(f.id)) : [],
      };
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

  async function duplicateItem(id) {
    if (!id || !cfg?.duplicate) return;
    try {
      const originalRes = await fetch(`${cfg.apiBase}/${id}`);
      if (!originalRes.ok) throw new Error(`Could not load ${cfg.type}`);
      const original = await originalRes.json();
      const duplicatePayload = cfg.duplicate.buildPayload(original);

      const createRes = await fetch(cfg.duplicate.createUrl, {
        method: cfg.duplicate.method || 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(duplicatePayload),
      });
      if (!createRes.ok) {
        let message = `Could not duplicate ${cfg.type}`;
        try {
          const data = await createRes.json();
          if (data?.error) message = data.error;
        } catch {}
        throw new Error(message);
      }

      if (cfg.reloadItems) await cfg.reloadItems();
      if (cfg.renderItems) cfg.renderItems();
      const label = cfg.duplicate.label || cfg.type || 'item';
      toast(`Duplicated ${label}.`, 'success');
    } catch (err) {
      toast(err.message || `Could not duplicate ${cfg.type}.`, 'error');
    }
  }

  async function restoreItems(ids) {
    if (!ids.length) return;
    let restored = 0;
    for (const id of ids) {
      try {
        const res = await fetch(`${cfg.apiBase}/${id}/state`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'active' }),
        });
        if (!res.ok) throw new Error();
        restored++;
      } catch {}
    }
    if (cfg.reloadItems) await cfg.reloadItems();
    if (cfg.renderItems) cfg.renderItems();
    toast(`Restored ${restored} item${restored === 1 ? '' : 's'}.`, restored ? 'success' : 'error');
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
    const pad = 8;
    tagPanel.style.left = `${Math.max(pad, Math.min(menuX, vw - pw - pad))}px`;
    tagPanel.style.top  = `${Math.max(pad, Math.min(menuY, vh - ph - pad))}px`;
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
          const result = await res.json().catch(() => ({}));
          const savedTags = Array.isArray(result.tags) ? result.tags : tags;
          ok++;
          if (cfg.onTagsUpdate) cfg.onTagsUpdate(id, savedTags);
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
  let toastTimer = null;

  function toast(msg, type = 'success') {
    const t = document.getElementById('toast');
    if (!t) return;
    clearTimeout(toastTimer);
    t.innerHTML = '';
    const text = document.createElement('span');
    text.textContent = msg;
    t.appendChild(text);
    t.className = `toast ${type} show`;
    toastTimer = setTimeout(() => { t.className = 'toast'; }, 4000);
  }

  function toastWithAction(msg, type, actionLabel, onAction) {
    const t = document.getElementById('toast');
    if (!t) return;
    clearTimeout(toastTimer);
    t.innerHTML = '';
    const text = document.createElement('span');
    text.textContent = msg;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'toast-action';
    btn.textContent = actionLabel;
    btn.addEventListener('click', async () => {
      t.className = 'toast';
      await onAction();
    });
    t.appendChild(text);
    t.appendChild(btn);
    t.className = `toast toast-has-action ${type} show`;
    toastTimer = setTimeout(() => { t.className = 'toast'; }, 6000);
  }
})();
