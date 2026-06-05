(async function () {
  // ─── Theme toggle ─────────────────────────────────────────────────────────────
  const themeBtn = document.getElementById('btn-theme-toggle');
  const uiScaleRange = document.getElementById('ui-scale-range');
  const uiScaleValue = document.getElementById('ui-scale-value');
  const uiScaleDownBtn = document.getElementById('btn-ui-scale-down');
  const uiScaleUpBtn = document.getElementById('btn-ui-scale-up');
  const uiScaleResetBtn = document.getElementById('btn-ui-scale-reset');
  const autosaveBtn = document.getElementById('btn-autosave-toggle');
  const scheduledBackupsBtn = document.getElementById('btn-scheduled-backups-toggle');
  const scheduledBackupHoursInput = document.getElementById('scheduled-backup-hours');
  const shortcutDefs = window.Shortcuts ? window.Shortcuts.getDefinitions() : [];
  const defaultShortcuts = window.Shortcuts ? window.Shortcuts.getDefaultShortcuts() : {};
  let autosaveEnabled = true;
  let scheduledBackupsEnabled = false;
  let uiScale = 1;
  let currentShortcuts = window.Shortcuts ? window.Shortcuts.loadStoredShortcuts() : {};
  let draftShortcuts = { ...currentShortcuts };
  let capturingShortcutAction = null;
  let appearanceSaveTimer = null;

  function applyScheduledBackups(enabled) {
    scheduledBackupsEnabled = !!enabled;
    scheduledBackupsBtn.textContent = scheduledBackupsEnabled ? 'On' : 'Off';
    scheduledBackupHoursInput.disabled = !scheduledBackupsEnabled;
  }

  function applyTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    localStorage.setItem('dnd-theme', t);
    themeBtn.textContent = t === 'dark' ? '☀ Switch to Light' : '☽ Switch to Dark';
  }

  function scheduleAppearanceSave() {
    clearTimeout(appearanceSaveTimer);
    appearanceSaveTimer = setTimeout(async () => {
      try {
        await fetch('/api/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            theme: document.documentElement.getAttribute('data-theme') || 'dark',
            uiScale,
          }),
        });
      } catch {}
    }, 150);
  }

  function clampUiScale(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 1;
    return Math.max(0.85, Math.min(1.25, Math.round(n * 100) / 100));
  }

  function applyUiScale(value) {
    uiScale = clampUiScale(value);
    document.documentElement.style.setProperty('--ui-scale', String(uiScale));
    localStorage.setItem('dnd-ui-scale', String(uiScale));
    uiScaleRange.value = String(uiScale);
    uiScaleValue.textContent = `${Math.round(uiScale * 100)}%`;
    uiScaleDownBtn.disabled = uiScale <= 0.85;
    uiScaleUpBtn.disabled = uiScale >= 1.25;
  }

  function applyAutosave(enabled) {
    autosaveEnabled = !!enabled;
    autosaveBtn.textContent = autosaveEnabled ? 'On' : 'Off';
  }

  applyTheme(localStorage.getItem('dnd-theme') || 'dark');
  applyUiScale(localStorage.getItem('dnd-ui-scale') || '1');
  themeBtn.addEventListener('click', () => {
    applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
    scheduleAppearanceSave();
  });
  uiScaleRange.addEventListener('input', () => applyUiScale(uiScaleRange.value));
  uiScaleRange.addEventListener('change', () => scheduleAppearanceSave());
  uiScaleDownBtn.addEventListener('click', () => applyUiScale(uiScale - 0.05));
  uiScaleDownBtn.addEventListener('click', () => scheduleAppearanceSave());
  uiScaleUpBtn.addEventListener('click', () => applyUiScale(uiScale + 0.05));
  uiScaleUpBtn.addEventListener('click', () => scheduleAppearanceSave());
  uiScaleResetBtn.addEventListener('click', () => applyUiScale(1));
  uiScaleResetBtn.addEventListener('click', () => scheduleAppearanceSave());
  autosaveBtn.addEventListener('click', () => applyAutosave(!autosaveEnabled));
  scheduledBackupsBtn.addEventListener('click', () => applyScheduledBackups(!scheduledBackupsEnabled));

  // ─── Hover preview (localStorage only — no server needed) ─────────────────
  const hoverPreviewBtn = document.getElementById('btn-hover-preview-toggle');
  const hoverDelayRow   = document.getElementById('hover-delay-row');
  const hoverDelayInput = document.getElementById('hover-delay-input');

  function applyHoverPreview(enabled) {
    localStorage.setItem('dnd-hover-preview-enabled', enabled ? 'true' : 'false');
    hoverPreviewBtn.textContent = enabled ? 'On' : 'Off';
    hoverDelayRow.style.opacity = enabled ? '1' : '0.4';
    hoverDelayInput.disabled = !enabled;
  }

  applyHoverPreview(localStorage.getItem('dnd-hover-preview-enabled') !== 'false');
  hoverDelayInput.value = localStorage.getItem('dnd-hover-preview-delay') || '500';

  hoverPreviewBtn.addEventListener('click', () => {
    applyHoverPreview(localStorage.getItem('dnd-hover-preview-enabled') === 'false');
  });

  hoverDelayInput.addEventListener('change', () => {
    const val = Math.max(100, Math.min(5000, parseInt(hoverDelayInput.value, 10) || 500));
    hoverDelayInput.value = val;
    localStorage.setItem('dnd-hover-preview-delay', String(val));
  });

  const list = document.getElementById('party-list');
  let count = 0;

  function makePlayerRow(data = {}) {
    count++;
    const row = document.createElement('div');
    row.className = 'form-grid party-row';
    row.style.cssText = 'grid-template-columns: 1fr 1fr auto; gap: 10px; margin-bottom: 8px;';
    row.innerHTML = `
      <div class="field">
        <label>Player Name</label>
        <input type="text" class="player-name" placeholder="Aldric" value="${h(data.name || '')}">
      </div>
      <div class="field">
        <label>Class / Role</label>
        <input type="text" class="player-class" placeholder="Paladin" value="${h(data.playerClass || '')}">
      </div>
      <div class="field" style="align-self:flex-end; padding-bottom:2px;">
        <button type="button" class="btn btn-ghost remove-btn" style="color:var(--danger);">✕</button>
      </div>`;
    row.querySelector('.remove-btn').addEventListener('click', () => row.remove());
    return row;
  }

  function h(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  function renderShortcutRows() {
    const listEl = document.getElementById('shortcut-list');
    if (!listEl) return;

    listEl.innerHTML = shortcutDefs.map(def => {
      const combo = draftShortcuts[def.action] || '';
      return `
        <div class="shortcut-row${capturingShortcutAction === def.action ? ' capturing' : ''}" data-action="${def.action}">
          <div class="shortcut-meta">
            <div class="shortcut-meta-label">${h(def.label)}</div>
            <div class="shortcut-meta-desc">${h(def.description)}</div>
          </div>
          <button type="button" class="btn btn-ghost shortcut-capture-btn${combo ? '' : ' is-empty'}" data-capture-action="${def.action}">
            ${combo ? h(combo) : 'Unassigned'}
          </button>
          <div class="shortcut-row-actions">
            <button type="button" class="btn btn-ghost btn-reset-shortcut" data-reset-action="${def.action}">Reset</button>
            <button type="button" class="btn btn-ghost btn-clear-shortcut" data-clear-action="${def.action}">Clear</button>
          </div>
        </div>
      `;
    }).join('');

    listEl.querySelectorAll('[data-capture-action]').forEach(btn => {
      btn.addEventListener('click', () => startShortcutCapture(btn.dataset.captureAction));
    });
    listEl.querySelectorAll('[data-reset-action]').forEach(btn => {
      btn.addEventListener('click', () => {
        draftShortcuts[btn.dataset.resetAction] = defaultShortcuts[btn.dataset.resetAction];
        capturingShortcutAction = null;
        renderShortcutRows();
        updateShortcutWarning();
      });
    });
    listEl.querySelectorAll('[data-clear-action]').forEach(btn => {
      btn.addEventListener('click', () => {
        draftShortcuts[btn.dataset.clearAction] = '';
        capturingShortcutAction = null;
        renderShortcutRows();
        updateShortcutWarning();
      });
    });
  }

  function findDuplicateShortcuts(shortcuts) {
    const seen = new Map();
    Object.entries(shortcuts).forEach(([action, combo]) => {
      const normalized = window.Shortcuts ? window.Shortcuts.canonicalizeShortcutString(combo) : combo;
      if (!normalized) return;
      if (!seen.has(normalized)) seen.set(normalized, []);
      seen.get(normalized).push(action);
    });
    return [...seen.entries()].filter(([, actions]) => actions.length > 1);
  }

  function updateShortcutWarning() {
    const warning = document.getElementById('shortcut-duplicate-warning');
    const saveBtn = document.getElementById('btn-save-shortcuts');
    const duplicates = findDuplicateShortcuts(draftShortcuts);
    if (!duplicates.length) {
      warning.textContent = '';
      warning.classList.add('hidden');
      saveBtn.disabled = false;
      return;
    }

    const labelByAction = Object.fromEntries(shortcutDefs.map(def => [def.action, def.label]));
    warning.textContent = duplicates.map(([combo, actions]) =>
      `${combo} is assigned to ${actions.map(action => labelByAction[action] || action).join(', ')}.`
    ).join(' ');
    warning.classList.remove('hidden');
    saveBtn.disabled = true;
  }

  function openShortcutModal() {
    draftShortcuts = { ...currentShortcuts };
    capturingShortcutAction = null;
    renderShortcutRows();
    updateShortcutWarning();
    document.getElementById('shortcut-modal-overlay').classList.remove('hidden');
  }

  function closeShortcutModal() {
    capturingShortcutAction = null;
    document.getElementById('shortcut-modal-overlay').classList.add('hidden');
  }

  function startShortcutCapture(action) {
    capturingShortcutAction = action;
    renderShortcutRows();
    updateShortcutWarning();
  }

  async function saveShortcutSettings() {
    if (findDuplicateShortcuts(draftShortcuts).length) {
      updateShortcutWarning();
      return;
    }

    const btn = document.getElementById('btn-save-shortcuts');
    btn.disabled = true;
    btn.textContent = 'Saving…';

    try {
      const normalized = window.Shortcuts ? window.Shortcuts.saveStoredShortcuts(draftShortcuts) : { ...draftShortcuts };
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shortcuts: normalized }),
      });
      const saved = await res.json();
      if (!res.ok) throw new Error(saved.error || 'Save failed');
      currentShortcuts = saved.shortcuts || normalized;
      if (window.Shortcuts) window.Shortcuts.saveStoredShortcuts(currentShortcuts);
      window.dispatchEvent(new CustomEvent('dnd-shortcuts-updated'));
      closeShortcutModal();
      showToast('Keyboard shortcuts saved.', 'success');
    } catch (err) {
      showToast('Could not save shortcuts: ' + err.message, 'error');
    } finally {
      btn.textContent = 'Save Shortcuts';
      btn.disabled = false;
    }
  }

  // Load existing settings
  try {
    const res = await fetch('/api/settings');
    const settings = await res.json();
    if (!localStorage.getItem('dnd-theme') && settings.theme) applyTheme(settings.theme);
    if (!localStorage.getItem('dnd-ui-scale')) applyUiScale(settings.uiScale || 1);
    applyAutosave(settings.autosaveEnabled !== false);
    applyScheduledBackups(settings.scheduledBackupsEnabled === true);
    currentShortcuts = settings.shortcuts
      ? (window.Shortcuts ? window.Shortcuts.saveStoredShortcuts(settings.shortcuts) : settings.shortcuts)
      : currentShortcuts;
    scheduledBackupHoursInput.value = settings.scheduledBackupIntervalHours || 24;
    (settings.party || []).forEach(p => list.appendChild(makePlayerRow(p)));
  } catch {
    // start empty
    applyAutosave(true);
    applyScheduledBackups(false);
    scheduledBackupHoursInput.value = 24;
  }

  document.getElementById('btn-add-player').addEventListener('click', () => {
    list.appendChild(makePlayerRow());
  });

  document.getElementById('btn-shortcuts-modal').addEventListener('click', openShortcutModal);
  document.getElementById('btn-close-shortcuts').addEventListener('click', closeShortcutModal);
  document.getElementById('btn-cancel-shortcuts').addEventListener('click', closeShortcutModal);
  document.getElementById('btn-reset-shortcuts').addEventListener('click', () => {
    draftShortcuts = { ...defaultShortcuts };
    capturingShortcutAction = null;
    renderShortcutRows();
    updateShortcutWarning();
  });
  document.getElementById('btn-save-shortcuts').addEventListener('click', saveShortcutSettings);
  document.getElementById('shortcut-modal-overlay').addEventListener('click', event => {
    if (event.target.id === 'shortcut-modal-overlay') closeShortcutModal();
  });

  document.addEventListener('keydown', event => {
    const overlay = document.getElementById('shortcut-modal-overlay');
    if (!overlay || overlay.classList.contains('hidden')) return;

    if (capturingShortcutAction) {
      event.preventDefault();
      event.stopPropagation();

      if (event.key === 'Escape') {
        capturingShortcutAction = null;
        renderShortcutRows();
        updateShortcutWarning();
        return;
      }

      if (event.key === 'Backspace' || event.key === 'Delete') {
        draftShortcuts[capturingShortcutAction] = '';
        capturingShortcutAction = null;
        renderShortcutRows();
        updateShortcutWarning();
        return;
      }

      const combo = window.Shortcuts ? window.Shortcuts.eventToCombo(event) : '';
      if (!combo) return;
      draftShortcuts[capturingShortcutAction] = combo;
      capturingShortcutAction = null;
      renderShortcutRows();
      updateShortcutWarning();
      return;
    }

    if (event.key === 'Escape') {
      closeShortcutModal();
    }
  }, true);

  document.getElementById('btn-save').addEventListener('click', async () => {
    const party = [...list.querySelectorAll('.party-row')].map(row => ({
      name: row.querySelector('.player-name').value.trim(),
      playerClass: row.querySelector('.player-class').value.trim(),
    })).filter(p => p.name || p.playerClass);

    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          party,
          theme: document.documentElement.getAttribute('data-theme') || 'dark',
          uiScale,
          autosaveEnabled,
          scheduledBackupsEnabled,
          scheduledBackupIntervalHours: Number(scheduledBackupHoursInput.value) || 24,
          shortcuts: currentShortcuts,
        }),
      });
      if (!res.ok) throw new Error('Save failed');
      showToast('Settings saved.', 'success');
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    }
  });

  document.getElementById('btn-clear-data').addEventListener('click', async () => {
    const ok = await showConfirm(
      'Delete all saved session and encounter plans? Exported files on your filesystem are unaffected. The demo plans will reappear on next visit.',
      { title: 'Clear All Data', confirmLabel: 'Clear All', danger: true }
    );
    if (!ok) return;
    try {
      const res = await fetch('/api/settings/data', { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.json()).error || 'Clear failed');
      showToast('All data cleared. Demo plans will reappear on next page load.', 'success');
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    }
  });

  // ─── Export & Import ──────────────────────────────────────────────────────

  let exportData = { sessions: [], encounters: [] };
  let exportItems = [];
  const selectedExportKeys = new Set();

  // Maps for "Select All Related"
  // sessionToEncounters: sessionId → Set of encounter IDs
  // encounterToSession:  encounterId → sessionId
  const sessionToEncounters = new Map();
  const encounterToSession  = new Map();

  function exportKey(type, id) {
    return `${type}:${id}`;
  }

  function flattenExportItems() {
    exportItems = [
      ...exportData.sessions.map(session => ({
        type: 'session',
        id: session.id,
        label: session.goal || `Session #${session.sessionNumber}`,
        tags: session.tags || [],
        createdAt: session.createdAt || null,
      })),
      ...exportData.encounters.map(encounter => ({
        type: 'encounter',
        id: encounter.id,
        label: encounter.name || encounter.id,
        tags: encounter.tags || [],
        createdAt: encounter.createdAt || null,
      })),
    ];
  }

  function renderExportList(items, isFiltered) {
    const listEl = document.getElementById('export-list');

    if (!items.length) {
      listEl.innerHTML = isFiltered
        ? `<p style="padding:12px; color:var(--muted); font-family:var(--font-body); font-style:italic;">No plans match your search.</p>`
        : `<p style="padding:12px; color:var(--muted); font-family:var(--font-body); font-style:italic;">No plans saved yet.</p>`;
      updateExportButton();
      return;
    }

    listEl.innerHTML = '';
    items.forEach(item => listEl.appendChild(makeExportItem(item.type, item.id, item.label)));

    listEl.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      cb.checked = selectedExportKeys.has(exportKey(cb.dataset.type, cb.dataset.id));
      cb.addEventListener('change', () => {
        const key = exportKey(cb.dataset.type, cb.dataset.id);
        if (cb.checked) selectedExportKeys.add(key);
        else selectedExportKeys.delete(key);
        updateExportButton();
      });
    });

    updateExportButton();
  }

  async function loadExportList() {
    const listEl = document.getElementById('export-list');
    try {
      const res = await fetch('/api/settings/export-data');
      if (!res.ok) throw new Error('Load failed');
      exportData = await res.json();
    } catch (err) {
      listEl.innerHTML = `<p style="padding:12px; color:var(--danger); font-family:var(--font-body);">Could not load plans: ${err.message}</p>`;
      return;
    }

    // Build relationship maps
    sessionToEncounters.clear();
    encounterToSession.clear();

    for (const enc of exportData.encounters) {
      if (enc.sessionId) {
        if (!sessionToEncounters.has(enc.sessionId)) sessionToEncounters.set(enc.sessionId, new Set());
        sessionToEncounters.get(enc.sessionId).add(enc.id);
        encounterToSession.set(enc.id, enc.sessionId);
      }
    }
    for (const s of exportData.sessions) {
      const encCards = (s.data && s.data.encounters) ? s.data.encounters : [];
      for (const card of encCards) {
        if (!card.encounterPlanId) continue;
        if (!sessionToEncounters.has(s.id)) sessionToEncounters.set(s.id, new Set());
        sessionToEncounters.get(s.id).add(card.encounterPlanId);
        if (!encounterToSession.has(card.encounterPlanId)) encounterToSession.set(card.encounterPlanId, s.id);
      }
    }

    flattenExportItems();

    if (window.initSearch) {
      initSearch({
        containerId: 'export-search-bar',
        getAllItems: () => exportItems,
        renderFn: renderExportList,
        fields: [
          item => item.id,
          item => item.label,
          item => (item.tags || []).join(' '),
          item => item.type,
        ],
        dateField: item => item.createdAt,
      });
    }

    renderExportList(exportItems, false);
  }

  async function loadBackups() {
    const listEl = document.getElementById('backup-list');
    try {
      const res = await fetch('/api/settings/backups');
      if (!res.ok) throw new Error('Load failed');
      const backups = await res.json();
      if (!backups.length) {
        listEl.innerHTML = `<p style="padding:12px; color:var(--muted); font-family:var(--font-body); font-style:italic;">No backups yet.</p>`;
        return;
      }

      listEl.innerHTML = backups.map(backup => `
        <div class="export-item" style="display:flex; align-items:center; gap:12px;">
          <div style="flex:1;">
            <div class="export-item-label">${escHtml(backup.name)}</div>
            <div class="export-item-id">${escHtml(backup.createdAt || 'Unknown date')} · ${backup.sessionCount} session(s) · ${backup.encounterCount} encounter(s)</div>
          </div>
          <button type="button" class="btn btn-ghost btn-restore-backup" data-name="${escAttr(backup.name)}">Restore</button>
        </div>
      `).join('');

      listEl.querySelectorAll('.btn-restore-backup').forEach(btn => {
        btn.addEventListener('click', async () => {
          const ok = await showConfirm(`Restore backup ${btn.dataset.name}? This replaces the app's current sessions, encounters, and settings.`, {
            title: 'Restore Backup',
            confirmLabel: 'Restore',
            danger: true,
          });
          if (!ok) return;
          try {
            const res = await fetch('/api/settings/restore', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ name: btn.dataset.name }),
            });
            const result = await res.json();
            if (!res.ok) throw new Error(result.error || 'Restore failed');
            showToast(`Restored ${result.sessionCount} session(s) and ${result.encounterCount} encounter(s) from backup.`, 'success');
            setTimeout(() => { location.reload(); }, 1000);
          } catch (err) {
            showToast('Restore failed: ' + err.message, 'error');
          }
        });
      });
    } catch (err) {
      listEl.innerHTML = `<p style="padding:12px; color:var(--danger); font-family:var(--font-body);">Could not load backups: ${err.message}</p>`;
    }
  }

  function buildSettingsNav() {
    const nav = document.getElementById('settings-nav');
    if (!nav) return;

    const sections = [
      { id: 'settings-appearance', num: '01', label: 'Appearance' },
      { id: 'settings-party', num: '02', label: 'Party Roster' },
      { id: 'settings-export-import', num: '03', label: 'Export & Import' },
      { id: 'settings-backups', num: '04', label: 'Backups' },
      { id: 'settings-danger', num: '!', label: 'Danger Zone' },
    ];

    const title = document.createElement('p');
    title.className = 'toc-title';
    title.textContent = 'Sections';

    const ul = document.createElement('ul');
    sections.forEach(section => {
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = `#${section.id}`;
      a.className = 'toc-h2';
      a.dataset.target = section.id;
      a.innerHTML = `<span class="toc-num">${section.num}</span>${section.label}`;
      a.addEventListener('click', event => {
        event.preventDefault();
        const el = document.getElementById(section.id);
        if (!el) return;
        const top = el.getBoundingClientRect().top + window.scrollY - 72;
        window.scrollTo({ top, behavior: 'smooth' });
      });
      li.appendChild(a);
      ul.appendChild(li);
    });

    nav.innerHTML = '';
    nav.appendChild(title);
    nav.appendChild(ul);

    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        nav.querySelectorAll('a').forEach(link => link.classList.remove('toc-active'));
        const active = nav.querySelector(`a[data-target="${entry.target.id}"]`);
        if (active) active.classList.add('toc-active');
      });
    }, { rootMargin: '-5% 0px -75% 0px', threshold: 0 });

    sections.forEach(section => {
      const el = document.getElementById(section.id);
      if (el) observer.observe(el);
    });
  }

  function makeExportItem(type, id, label) {
    const item = document.createElement('label');
    item.className = 'export-item';
    item.innerHTML = `
      <input type="checkbox" data-id="${escAttr(id)}" data-type="${type}">
      <span class="export-type-badge ${type}">${type === 'session' ? 'Session' : 'Encounter'}</span>
      <span class="export-item-label">${escHtml(label)}</span>
      <span class="export-item-id">${escHtml(id)}</span>`;
    return item;
  }

  function escHtml(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
  function escAttr(s) { return s.replace(/"/g, '&quot;'); }

  function getCheckedIds() {
    return [...selectedExportKeys].map(key => {
      const [type, ...rest] = key.split(':');
      return { type, id: rest.join(':') };
    });
  }

  function updateExportButton() {
    const n = getCheckedIds().length;
    const btn = document.getElementById('btn-export-json');
    btn.textContent = `Export Selected (${n})`;
    btn.disabled = n === 0;
  }

  document.getElementById('btn-select-all').addEventListener('click', () => {
    exportItems.forEach(item => selectedExportKeys.add(exportKey(item.type, item.id)));
    document.querySelectorAll('#export-list input[type="checkbox"]').forEach(cb => { cb.checked = true; });
    updateExportButton();
  });

  document.getElementById('btn-deselect-all').addEventListener('click', () => {
    selectedExportKeys.clear();
    document.querySelectorAll('#export-list input[type="checkbox"]').forEach(cb => { cb.checked = false; });
    updateExportButton();
  });

  document.getElementById('btn-select-related').addEventListener('click', () => {
    const checked = getCheckedIds();
    const toAdd = new Set();

    for (const { id, type } of checked) {
      if (type === 'session') {
        (sessionToEncounters.get(id) || new Set()).forEach(eid => toAdd.add(`encounter:${eid}`));
      } else {
        const sid = encounterToSession.get(id);
        if (sid) toAdd.add(`session:${sid}`);
      }
    }

    for (const key of toAdd) {
      selectedExportKeys.add(key);
      const [t, id] = key.split(':');
      const cb = document.querySelector(`#export-list input[data-type="${t}"][data-id="${escAttr(id)}"]`);
      if (cb) cb.checked = true;
    }
    updateExportButton();
  });

  document.getElementById('btn-export-json').addEventListener('click', () => {
    const checked = getCheckedIds();
    const sessionIds  = new Set(checked.filter(x => x.type === 'session').map(x => x.id));
    const encounterIds = new Set(checked.filter(x => x.type === 'encounter').map(x => x.id));

    const payload = {
      sessions:   exportData.sessions.filter(s => sessionIds.has(s.id)),
      encounters: exportData.encounters.filter(e => encounterIds.has(e.id)),
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `dnd-plans-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`Exported ${payload.sessions.length} session(s) and ${payload.encounters.length} encounter(s).`, 'success');
  });

  // Import
  const fileInput    = document.getElementById('import-file-input');
  const fileNameEl   = document.getElementById('import-filename');
  const importBtn    = document.getElementById('btn-import-json');
  let importFileData = null;

  fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];
    const previewEl = document.getElementById('import-preview');
    if (!file) { fileNameEl.textContent = 'No file selected'; importBtn.disabled = true; importFileData = null; return; }
    fileNameEl.textContent = file.name;
    const reader = new FileReader();
    reader.onload = e => {
      try {
        importFileData = JSON.parse(e.target.result);
        if (!importFileData.sessions && !importFileData.encounters) throw new Error('Invalid format');
        const currentSessionIds = new Set(exportData.sessions.map(s => s.id));
        const currentEncounterIds = new Set(exportData.encounters.map(enc => enc.id));
        const incomingSessions = importFileData.sessions || [];
        const incomingEncounters = importFileData.encounters || [];
        const newSessions = incomingSessions.filter(s => s.id && !currentSessionIds.has(s.id)).length;
        const duplicateSessions = incomingSessions.filter(s => s.id && currentSessionIds.has(s.id)).length;
        const newEncounters = incomingEncounters.filter(enc => enc.id && !currentEncounterIds.has(enc.id)).length;
        const duplicateEncounters = incomingEncounters.filter(enc => enc.id && currentEncounterIds.has(enc.id)).length;
        previewEl.textContent = `Preview: ${newSessions} new session(s), ${duplicateSessions} duplicate session(s), ${newEncounters} new encounter(s), ${duplicateEncounters} duplicate encounter(s). Duplicates will be skipped.`;
        importBtn.disabled = false;
      } catch {
        fileNameEl.textContent = 'Invalid JSON file';
        importBtn.disabled = true;
        importFileData = null;
        previewEl.textContent = '';
      }
    };
    reader.readAsText(file);
  });

  importBtn.addEventListener('click', async () => {
    if (!importFileData) return;
    importBtn.disabled = true;
    importBtn.textContent = 'Importing…';
    try {
      const res = await fetch('/api/settings/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessions:   importFileData.sessions   || [],
          encounters: importFileData.encounters || [],
        }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Import failed');
      showToast(`Imported ${result.importedSessions} session(s) and ${result.importedEncounters} encounter(s).`, 'success');
      fileInput.value = '';
      fileNameEl.textContent = 'No file selected';
      document.getElementById('import-preview').textContent = '';
      importFileData = null;
      loadExportList();
      loadBackups();
    } catch (err) {
      showToast('Import failed: ' + err.message, 'error');
    } finally {
      importBtn.disabled = false;
      importBtn.textContent = 'Import';
    }
  });

  document.getElementById('btn-create-backup').addEventListener('click', async () => {
    try {
      const res = await fetch('/api/settings/backup', { method: 'POST' });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Backup failed');
      showToast(`Created backup snapshot ${result.name}.`, 'success');
      loadBackups();
    } catch (err) {
      showToast('Backup failed: ' + err.message, 'error');
    }
  });

  loadExportList();
  loadBackups();
  buildSettingsNav();

  function showToast(msg, type = 'success') {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.className = `toast ${type} show`;
    setTimeout(() => { t.className = 'toast'; }, 4000);
  }
})();
