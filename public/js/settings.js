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
  const settingsSaveStatus = document.getElementById('settings-save-status');
  const shortcutDefs = window.Shortcuts ? window.Shortcuts.getDefinitions() : [];
  const defaultShortcuts = window.Shortcuts ? window.Shortcuts.getDefaultShortcuts() : {};
  let autosaveEnabled = true;
  let scheduledBackupsEnabled = false;
  let uiScale = 1;
  let currentShortcuts = window.Shortcuts ? window.Shortcuts.loadStoredShortcuts() : {};
  let draftShortcuts = { ...currentShortcuts };
  let capturingShortcutAction = null;
  let settingsSaveTimer = null;
  let settingsSaveInFlight = false;
  let settingsSaveQueued = false;
  let settingsLoaded = false;
  let activeCampaign = null;

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

  function setSettingsSaveStatus(message, tone = 'idle') {
    if (!settingsSaveStatus) return;
    settingsSaveStatus.textContent = message;
    settingsSaveStatus.dataset.state = tone;
  }

  function collectPartyRows() {
    return [...list.querySelectorAll('.party-row')].map(row => ({
      name: row.querySelector('.player-name').value.trim(),
      playerClass: row.querySelector('.player-class').value.trim(),
      characterUrl: row.querySelector('.player-url').value.trim(),
    })).filter(p => p.name || p.playerClass);
  }

  function collectSettingsPayload() {
    return {
      party: collectPartyRows(),
      theme: document.documentElement.getAttribute('data-theme') || 'dark',
      uiScale,
      autosaveEnabled,
      scheduledBackupsEnabled,
      scheduledBackupIntervalHours: Number(scheduledBackupHoursInput.value) || 24,
      shortcuts: currentShortcuts,
    };
  }

  function scheduleSettingsSave(delay = 180) {
    if (!settingsLoaded) return;
    clearTimeout(settingsSaveTimer);
    setSettingsSaveStatus('Saving changes…', 'saving');
    settingsSaveTimer = setTimeout(() => {
      saveSettings(false).catch(() => {});
    }, delay);
  }

  async function saveSettings(showToastOnSuccess = false) {
    if (!settingsLoaded) return;
    if (settingsSaveInFlight) {
      settingsSaveQueued = true;
      return;
    }

    settingsSaveInFlight = true;
    setSettingsSaveStatus('Saving changes…', 'saving');

    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(collectSettingsPayload()),
      });
      const saved = await res.json();
      if (!res.ok) throw new Error(saved.error || 'Save failed');

      if (saved.shortcuts) {
        currentShortcuts = window.Shortcuts ? window.Shortcuts.saveStoredShortcuts(saved.shortcuts) : saved.shortcuts;
      }
      if (saved.autosaveEnabled !== undefined) applyAutosave(saved.autosaveEnabled);
      if (saved.scheduledBackupsEnabled !== undefined) applyScheduledBackups(saved.scheduledBackupsEnabled);
      if (saved.scheduledBackupIntervalHours !== undefined) scheduledBackupHoursInput.value = saved.scheduledBackupIntervalHours;
      setSettingsSaveStatus('Changes saved.', 'saved');
      if (showToastOnSuccess) showToast('Settings saved.', 'success');
    } catch (err) {
      setSettingsSaveStatus('Could not save changes.', 'error');
      throw err;
    } finally {
      settingsSaveInFlight = false;
      if (settingsSaveQueued) {
        settingsSaveQueued = false;
        scheduleSettingsSave(75);
      }
    }
  }

  applyTheme(localStorage.getItem('dnd-theme') || 'dark');
  applyUiScale(localStorage.getItem('dnd-ui-scale') || '1');
  themeBtn.addEventListener('click', () => {
    applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
    scheduleSettingsSave();
  });
  uiScaleRange.addEventListener('input', () => {
    applyUiScale(uiScaleRange.value);
    scheduleSettingsSave();
  });
  uiScaleDownBtn.addEventListener('click', () => {
    applyUiScale(uiScale - 0.05);
    scheduleSettingsSave();
  });
  uiScaleUpBtn.addEventListener('click', () => {
    applyUiScale(uiScale + 0.05);
    scheduleSettingsSave();
  });
  uiScaleResetBtn.addEventListener('click', () => {
    applyUiScale(1);
    scheduleSettingsSave();
  });
  autosaveBtn.addEventListener('click', () => {
    applyAutosave(!autosaveEnabled);
    scheduleSettingsSave();
  });
  scheduledBackupsBtn.addEventListener('click', () => {
    applyScheduledBackups(!scheduledBackupsEnabled);
    scheduleSettingsSave();
  });

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

  // Show which campaign's party roster this belongs to
  fetch('/api/campaigns/active').then(r => r.json()).then(campaign => {
    activeCampaign = campaign || null;
    const tag = document.getElementById('settings-campaign-tag');
    if (tag && campaign?.name) tag.textContent = campaign.name;
  }).catch(() => {});

  const list = document.getElementById('party-list');
  let count = 0;

  function makePlayerRow(data = {}) {
    count++;
    const row = document.createElement('div');
    row.className = 'form-grid party-row';
    row.style.cssText = 'grid-template-columns: 1fr 1fr 1.6fr auto; gap: 10px; margin-bottom: 8px;';
    row.innerHTML = `
      <div class="field">
        <label>Player Name</label>
        <input type="text" class="player-name" placeholder="Aldric" value="${h(data.name || '')}">
      </div>
      <div class="field">
        <label>Class / Role</label>
        <input type="text" class="player-class" placeholder="Paladin" value="${h(data.playerClass || '')}">
      </div>
      <div class="field">
        <label class="party-url-label">Character Sheet URL <span class="party-url-hint">(optional)</span></label>
        <input type="url" class="player-url" placeholder="https://dndbeyond.com/characters/…" value="${h(data.characterUrl || '')}">
      </div>
      <div class="field" style="align-self:flex-end; padding-bottom:2px;">
        <button type="button" class="btn btn-ghost remove-btn" style="color:var(--danger);">✕</button>
      </div>`;
    row.querySelector('.remove-btn').addEventListener('click', () => {
      row.remove();
      scheduleSettingsSave();
    });
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
    settingsLoaded = true;
    setSettingsSaveStatus('Changes save automatically.', 'idle');
  } catch {
    // start empty
    applyAutosave(true);
    applyScheduledBackups(false);
    scheduledBackupHoursInput.value = 24;
    settingsLoaded = true;
    setSettingsSaveStatus('Changes save automatically.', 'idle');
  }

  document.getElementById('btn-add-player').addEventListener('click', () => {
    list.appendChild(makePlayerRow());
    scheduleSettingsSave();
  });

  list.addEventListener('input', event => {
    if (!event.target.matches('.player-name, .player-class, .player-url')) return;
    scheduleSettingsSave();
  });

  list.addEventListener('change', event => {
    if (!event.target.matches('.player-name, .player-class, .player-url')) return;
    scheduleSettingsSave();
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

  scheduledBackupHoursInput.addEventListener('input', () => {
    scheduleSettingsSave();
  });
  scheduledBackupHoursInput.addEventListener('change', () => {
    scheduleSettingsSave();
  });

  document.getElementById('btn-clear-data').addEventListener('click', async () => {
    const ok = await showConfirm(
      'Move all active sessions, encounters, NPCs, locations, and factions in this campaign to trash? You can restore them later from Archive & Trash.',
      { title: 'Move All to Trash', confirmLabel: 'Move to Trash', danger: true }
    );
    if (!ok) return;
    try {
      const res = await fetch('/api/settings/data', { method: 'DELETE' });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Clear failed');
      showToastWithAction(
        `Moved ${result.count || 0} active record(s) to trash.`,
        'success',
        'Undo',
        async () => {
          const restoreRes = await fetch('/api/settings/records/state', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items: result.items || [], status: 'active' }),
          });
          const restoreResult = await restoreRes.json();
          if (!restoreRes.ok) throw new Error(restoreResult.error || 'Restore failed');
          await Promise.all([loadExportList(), loadLifecycleRecords()]);
          showToast('Restored moved records.', 'success');
        }
      );
      await Promise.all([loadExportList(), loadLifecycleRecords()]);
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    }
  });

  // ─── Export & Import ──────────────────────────────────────────────────────

  let exportData = { sessions: [], encounters: [], npcs: [], locations: [], factions: [] };
  let exportItems = [];
  let lifecycleItems = [];
  const selectedExportKeys = new Set();

  // Maps for "Select All Related"
  const sessionToEncounters = new Map();
  const encounterToSessions = new Map();
  const sessionToNpcs = new Map();
  const npcToSessions = new Map();
  const sessionToLocations = new Map();
  const locationToSessions = new Map();
  const encounterToNpcs = new Map();
  const npcToEncounters = new Map();
  const sessionToFactions = new Map();
  const factionToSessions = new Map();
  const encounterToFactions = new Map();
  const factionToEncounters = new Map();
  const npcToFactions = new Map();
  const factionToNpcs = new Map();
  const locationToFactions = new Map();
  const factionToLocations = new Map();

  function slugifyName(value, fallback = 'campaign') {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || fallback;
  }

  async function buildCampaignExportFiles(campaignId, campaignName) {
    const res = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/export`);
    const bundle = await res.json();
    if (!res.ok) throw new Error(bundle.error || 'Export failed');

    const files = [{
      filename: `${slugifyName(campaignName)}-export-${new Date().toISOString().slice(0, 10)}`,
      displayName: `${campaignName} Campaign Bundle`,
      type: 'bundle',
      json: JSON.stringify(bundle, null, 2),
    }];

    const sessionJobs = (bundle.sessions || []).map(async session => {
      const previewRes = await fetch('/api/sessions/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(session.data || session),
      });
      const preview = await previewRes.json();
      if (!previewRes.ok) return null;
      return {
        filename: preview.filename,
        displayName: session.goal || `Session ${String(session.sessionNumber || '?').padStart(3, '0')}`,
        type: 'session',
        markdown: preview.markdown,
        pdf: preview.pdf,
      };
    });

    const encounterJobs = (bundle.encounters || []).map(async encounter => {
      const previewRes = await fetch('/api/encounters/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(encounter.data || encounter),
      });
      const preview = await previewRes.json();
      if (!previewRes.ok) return null;
      return {
        filename: preview.filename,
        displayName: encounter.name || encounter.id,
        type: 'encounter',
        markdown: preview.markdown,
        pdf: preview.pdf,
      };
    });

    const npcJobs = (bundle.npcs || []).map(async npc => {
      const exportRes = await fetch('/api/npcs/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(npc),
      });
      const exported = await exportRes.json();
      if (!exportRes.ok) return null;
      return {
        filename: exported.filename,
        displayName: npc.name || npc.id,
        type: 'npc',
        markdown: exported.markdown,
        pdf: exported.pdf,
      };
    });

    const locationJobs = (bundle.locations || []).map(async location => {
      const exportRes = await fetch('/api/locations/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(location),
      });
      const exported = await exportRes.json();
      if (!exportRes.ok) return null;
      return {
        filename: exported.filename,
        displayName: location.name || location.id,
        type: 'location',
        markdown: exported.markdown,
        pdf: exported.pdf,
      };
    });

    const factionJobs = (bundle.factions || []).map(async faction => {
      const exportRes = await fetch('/api/factions/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(faction),
      });
      const exported = await exportRes.json();
      if (!exportRes.ok) return null;
      return {
        filename: exported.filename,
        displayName: faction.name || faction.id,
        type: 'faction',
        markdown: exported.markdown,
        pdf: exported.pdf,
      };
    });

    const results = await Promise.all([
      Promise.allSettled(sessionJobs),
      Promise.allSettled(encounterJobs),
      Promise.allSettled(npcJobs),
      Promise.allSettled(locationJobs),
      Promise.allSettled(factionJobs),
    ]);

    results.flat().forEach(result => {
      if (result.status === 'fulfilled' && result.value) files.push(result.value);
    });

    return files;
  }

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
      ...exportData.npcs.map(npc => ({
        type: 'npc',
        id: npc.id,
        label: npc.name || npc.id,
        tags: npc.tags || [],
        createdAt: npc.createdAt || null,
      })),
      ...exportData.locations.map(location => ({
        type: 'location',
        id: location.id,
        label: location.name || location.id,
        tags: location.tags || [],
        createdAt: location.createdAt || null,
      })),
      ...exportData.factions.map(faction => ({
        type: 'faction',
        id: faction.id,
        label: faction.name || faction.id,
        tags: faction.tags || [],
        createdAt: faction.createdAt || null,
      })),
    ];
  }

  function renderExportList(items, isFiltered) {
    const listEl = document.getElementById('export-list');

    if (!items.length) {
      listEl.innerHTML = isFiltered
        ? `<p style="padding:12px; color:var(--muted); font-family:var(--font-body); font-style:italic;">No records match your search.</p>`
        : `<p style="padding:12px; color:var(--muted); font-family:var(--font-body); font-style:italic;">No records saved yet.</p>`;
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
      exportData.sessions = Array.isArray(exportData.sessions) ? exportData.sessions : [];
      exportData.encounters = Array.isArray(exportData.encounters) ? exportData.encounters : [];
      exportData.npcs = Array.isArray(exportData.npcs) ? exportData.npcs : [];
      exportData.locations = Array.isArray(exportData.locations) ? exportData.locations : [];
      exportData.factions = Array.isArray(exportData.factions) ? exportData.factions : [];
    } catch (err) {
      listEl.innerHTML = `<p style="padding:12px; color:var(--danger); font-family:var(--font-body);">Could not load records: ${err.message}</p>`;
      return;
    }

    function addToMap(map, key, value) {
      if (!key || !value) return;
      if (!map.has(key)) map.set(key, new Set());
      map.get(key).add(value);
    }

    // Build relationship maps
    sessionToEncounters.clear();
    encounterToSessions.clear();
    sessionToNpcs.clear();
    npcToSessions.clear();
    sessionToLocations.clear();
    locationToSessions.clear();
    encounterToNpcs.clear();
    npcToEncounters.clear();
    sessionToFactions.clear();
    factionToSessions.clear();
    encounterToFactions.clear();
    factionToEncounters.clear();
    npcToFactions.clear();
    factionToNpcs.clear();
    locationToFactions.clear();
    factionToLocations.clear();

    for (const enc of exportData.encounters) {
      if (enc.sessionId) {
        addToMap(sessionToEncounters, enc.sessionId, enc.id);
        addToMap(encounterToSessions, enc.id, enc.sessionId);
      }
    }
    for (const s of exportData.sessions) {
      const encCards = (s.data && s.data.encounters) ? s.data.encounters : [];
      for (const card of encCards) {
        if (!card.encounterPlanId) continue;
        addToMap(sessionToEncounters, s.id, card.encounterPlanId);
        addToMap(encounterToSessions, card.encounterPlanId, s.id);
      }
      for (const npcId of s.data?.linkedNpcs || []) {
        addToMap(sessionToNpcs, s.id, npcId);
        addToMap(npcToSessions, npcId, s.id);
      }
      for (const locationId of s.data?.linkedLocations || []) {
        addToMap(sessionToLocations, s.id, locationId);
        addToMap(locationToSessions, locationId, s.id);
      }
    }
    for (const npc of exportData.npcs) {
      for (const sessionId of npc.linkedSessions || []) {
        addToMap(npcToSessions, npc.id, sessionId);
        addToMap(sessionToNpcs, sessionId, npc.id);
      }
      for (const encounterId of npc.linkedEncounters || []) {
        addToMap(npcToEncounters, npc.id, encounterId);
        addToMap(encounterToNpcs, encounterId, npc.id);
      }
    }
    for (const location of exportData.locations) {
      for (const sessionId of location.linkedSessions || []) {
        addToMap(locationToSessions, location.id, sessionId);
        addToMap(sessionToLocations, sessionId, location.id);
      }
    }
    for (const faction of exportData.factions) {
      for (const sessionId of faction.linkedSessions || []) {
        addToMap(factionToSessions, faction.id, sessionId);
        addToMap(sessionToFactions, sessionId, faction.id);
      }
      for (const encounterId of faction.linkedEncounters || []) {
        addToMap(factionToEncounters, faction.id, encounterId);
        addToMap(encounterToFactions, encounterId, faction.id);
      }
      for (const npcId of faction.linkedNpcs || []) {
        addToMap(factionToNpcs, faction.id, npcId);
        addToMap(npcToFactions, npcId, faction.id);
      }
      for (const locationId of faction.linkedLocations || []) {
        addToMap(factionToLocations, faction.id, locationId);
        addToMap(locationToFactions, locationId, faction.id);
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
            <div class="export-item-id">${escHtml(backup.createdAt || 'Unknown date')} · ${backup.sessionCount} session(s) · ${backup.encounterCount} encounter(s) · ${backup.npcCount || 0} NPC(s) · ${backup.locationCount || 0} location(s) · ${backup.factionCount || 0} faction(s)</div>
          </div>
          <button type="button" class="btn btn-ghost btn-restore-backup" data-name="${escAttr(backup.name)}">Restore</button>
        </div>
      `).join('');

      listEl.querySelectorAll('.btn-restore-backup').forEach(btn => {
        btn.addEventListener('click', async () => {
          const ok = await showConfirm(`Restore backup ${btn.dataset.name}? This replaces the app's current sessions, encounters, NPCs, locations, factions, and settings.`, {
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
            showToast(`Restored ${result.sessionCount} session(s), ${result.encounterCount} encounter(s), ${result.npcCount || 0} NPC(s), ${result.locationCount || 0} location(s), and ${result.factionCount || 0} faction(s) from backup.`, 'success');
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

  async function loadLifecycleRecords() {
    const listEl = document.getElementById('lifecycle-list');
    if (!listEl) return;
    try {
      const res = await fetch('/api/settings/records/lifecycle');
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || 'Load failed');
      lifecycleItems = Array.isArray(payload.items) ? payload.items : [];

      if (!lifecycleItems.length) {
        listEl.innerHTML = `<p style="padding:12px; color:var(--muted); font-family:var(--font-body); font-style:italic;">No archived or trashed records.</p>`;
        return;
      }

      listEl.innerHTML = lifecycleItems.map(item => `
        <div class="export-item lifecycle-item">
          <div class="lifecycle-meta">
            <div class="lifecycle-top">
              <span class="export-type-badge ${item.type}">${escHtml(typeLabel(item.type))}</span>
              <span class="import-item-status ${item.status === 'trashed' ? 'conflict' : 'duplicate'}">${item.status === 'trashed' ? 'Trashed' : 'Archived'}</span>
            </div>
            <div class="export-item-label">${escHtml(item.title || item.id)}</div>
            <div class="export-item-id">${escHtml(item.id)}${item.subtitle ? ` · ${escHtml(item.subtitle)}` : ''}${item.changedAt ? ` · ${escHtml(formatLifecycleDate(item.changedAt))}` : ''}</div>
          </div>
          <div class="lifecycle-actions">
            <button type="button" class="btn btn-ghost btn-lifecycle-restore" data-type="${escAttr(item.type)}" data-id="${escAttr(item.id)}">Restore</button>
            ${item.status === 'archived'
              ? `<button type="button" class="btn btn-ghost btn-lifecycle-trash" data-type="${escAttr(item.type)}" data-id="${escAttr(item.id)}" style="color:var(--danger);">Move to Trash</button>`
              : `<button type="button" class="btn btn-ghost btn-lifecycle-delete" data-type="${escAttr(item.type)}" data-id="${escAttr(item.id)}" style="color:var(--danger);">Delete Permanently</button>`
            }
          </div>
        </div>
      `).join('');

      listEl.querySelectorAll('.btn-lifecycle-restore').forEach(btn => {
        btn.addEventListener('click', async () => {
          try {
            await updateLifecycleItems([{ type: btn.dataset.type, id: btn.dataset.id }], 'active', 'Record restored.');
          } catch (err) {
            showToast('Restore failed: ' + err.message, 'error');
          }
        });
      });
      listEl.querySelectorAll('.btn-lifecycle-trash').forEach(btn => {
        btn.addEventListener('click', async () => {
          try {
            await updateLifecycleItems([{ type: btn.dataset.type, id: btn.dataset.id }], 'trashed', 'Record moved to trash.');
          } catch (err) {
            showToast('Update failed: ' + err.message, 'error');
          }
        });
      });
      listEl.querySelectorAll('.btn-lifecycle-delete').forEach(btn => {
        btn.addEventListener('click', async () => {
          const ok = await showConfirm(
            `Permanently delete ${btn.dataset.id}? This cannot be undone.`,
            { title: 'Delete Permanently', confirmLabel: 'Delete', danger: true }
          );
          if (!ok) return;
          await deleteLifecycleItems([{ type: btn.dataset.type, id: btn.dataset.id }], 'Record permanently deleted.');
        });
      });
    } catch (err) {
      listEl.innerHTML = `<p style="padding:12px; color:var(--danger); font-family:var(--font-body);">Could not load lifecycle records: ${err.message}</p>`;
    }
  }

  async function updateLifecycleItems(items, status, successMessage) {
    const res = await fetch('/api/settings/records/state', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items, status }),
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Update failed');
    await Promise.all([loadExportList(), loadLifecycleRecords()]);
    showToast(successMessage, 'success');
  }

  async function deleteLifecycleItems(items, successMessage) {
    const res = await fetch('/api/settings/records/permanent', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items }),
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Delete failed');
    await Promise.all([loadExportList(), loadLifecycleRecords()]);
    showToast(successMessage, 'success');
  }

  function typeLabel(type) {
    return {
      session: 'Session',
      encounter: 'Encounter',
      npc: 'NPC',
      location: 'Location',
      faction: 'Faction',
    }[type] || type;
  }

  function formatLifecycleDate(value) {
    try {
      return new Date(value).toLocaleString();
    } catch {
      return value;
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
      { id: 'settings-trash', num: '05', label: 'Archive & Trash' },
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
    const typeLabel = {
      session: 'Session',
      encounter: 'Encounter',
      npc: 'NPC',
      location: 'Location',
      faction: 'Faction',
    }[type] || type;
    const item = document.createElement('label');
    item.className = 'export-item';
    item.innerHTML = `
      <input type="checkbox" data-id="${escAttr(id)}" data-type="${type}">
      <span class="export-type-badge ${type}">${typeLabel}</span>
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
    const availableKeys = new Set(exportItems.map(item => exportKey(item.type, item.id)));

    function addKeys(type, ids) {
      (ids || new Set()).forEach(id => {
        const key = exportKey(type, id);
        if (availableKeys.has(key)) toAdd.add(key);
      });
    }

    for (const { id, type } of checked) {
      if (type === 'session') {
        addKeys('encounter', sessionToEncounters.get(id));
        addKeys('npc', sessionToNpcs.get(id));
        addKeys('location', sessionToLocations.get(id));
        addKeys('faction', sessionToFactions.get(id));
      } else if (type === 'encounter') {
        addKeys('session', encounterToSessions.get(id));
        addKeys('npc', encounterToNpcs.get(id));
        addKeys('faction', encounterToFactions.get(id));
      } else if (type === 'npc') {
        addKeys('session', npcToSessions.get(id));
        addKeys('encounter', npcToEncounters.get(id));
        addKeys('faction', npcToFactions.get(id));
      } else if (type === 'location') {
        addKeys('session', locationToSessions.get(id));
        addKeys('faction', locationToFactions.get(id));
      } else if (type === 'faction') {
        addKeys('session', factionToSessions.get(id));
        addKeys('encounter', factionToEncounters.get(id));
        addKeys('npc', factionToNpcs.get(id));
        addKeys('location', factionToLocations.get(id));
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
    const npcIds = new Set(checked.filter(x => x.type === 'npc').map(x => x.id));
    const locationIds = new Set(checked.filter(x => x.type === 'location').map(x => x.id));
    const factionIds = new Set(checked.filter(x => x.type === 'faction').map(x => x.id));
    const payload = {
      sessions:   exportData.sessions.filter(s => sessionIds.has(s.id)),
      encounters: exportData.encounters.filter(e => encounterIds.has(e.id)),
      npcs: exportData.npcs.filter(npc => npcIds.has(npc.id)),
      locations: exportData.locations.filter(location => locationIds.has(location.id)),
      factions: exportData.factions.filter(faction => factionIds.has(faction.id)),
    };
    const total = payload.sessions.length + payload.encounters.length + payload.npcs.length + payload.locations.length + payload.factions.length;

    ExportDialog.open({
      title: 'Export Selected Records',
      formatOptions: [
        { id: 'json', label: 'JSON', ext: '.json', checked: true },
      ],
      loadFiles: async () => [{
        filename: `dnd-plans-export-${new Date().toISOString().slice(0, 10)}`,
        displayName: `${total} selected record${total === 1 ? '' : 's'}`,
        type: 'bundle',
        json: JSON.stringify(payload, null, 2),
      }],
    });
  });

  document.getElementById('btn-export-campaign').addEventListener('click', async () => {
    if (!activeCampaign?.id) {
      showToast('Could not determine the active campaign.', 'error');
      return;
    }

    ExportDialog.open({
      title: `Export Campaign: ${activeCampaign.name || 'Campaign'}`,
      formatOptions: [
        { id: 'md', label: 'Markdown', ext: '.md', checked: true },
        { id: 'pdf', label: 'PDF', ext: '.pdf', checked: true },
        { id: 'json', label: 'JSON Bundle', ext: '.json', checked: true },
      ],
      loadFiles: async () => buildCampaignExportFiles(activeCampaign.id, activeCampaign.name || 'Campaign'),
    });
  });

  // Import
  const fileInput = document.getElementById('import-file-input');
  const fileNameEl = document.getElementById('import-filename');
  const importBtn = document.getElementById('btn-import-json');
  const importPreviewEl = document.getElementById('import-preview');
  const importTypeLabel = {
    session: 'Session',
    encounter: 'Encounter',
    npc: 'NPC',
    location: 'Location',
    faction: 'Faction',
  };
  const importStatusLabel = {
    new: 'New',
    duplicate: 'Duplicate',
    conflict: 'Conflict',
    'missing-id': 'Missing ID',
  };
  const importActionLabel = {
    import: 'Import',
    skip: 'Skip',
    clone: 'Clone With New ID',
    replace: 'Replace Existing',
  };
  let importFileData = null;
  let importPreviewState = null;
  let importReportState = null;

  function getImportAction(item) {
    if (!importPreviewState) return item.recommendedAction;
    const defaults = importPreviewState.resolution.defaults || {};
    const overrides = importPreviewState.resolution.overrides || {};
    return overrides[item.key] || defaults[item.status] || item.recommendedAction;
  }

  function getImportSelectionCount() {
    if (!importPreviewState?.preview?.items) return 0;
    return importPreviewState.preview.items.filter(item => getImportAction(item) !== 'skip').length;
  }

  function updateImportButton() {
    const count = getImportSelectionCount();
    importBtn.textContent = count ? `Import ${count} Record${count === 1 ? '' : 's'}` : 'Import';
    importBtn.disabled = !importPreviewState || count === 0;
  }

  function renderImportReport() {
    if (!importReportState) return '';
    const report = importReportState;
    const rows = report.remappedIds.length
      ? report.remappedIds.map(item => `
          <div class="import-report-row">
            <span class="export-type-badge ${item.type}">${importTypeLabel[item.type] || item.type}</span>
            <span class="import-report-label">${escHtml(item.label || item.fromId || 'Untitled')}</span>
            <span class="import-report-id">${escHtml(item.fromId)} → ${escHtml(item.toId)}</span>
          </div>
        `).join('')
      : '<p class="settings-hint" style="margin:10px 0 0;">No IDs had to be remapped in the last import.</p>';

    return `
      <div class="import-preview-panel" style="margin-top:14px;">
        <div class="import-preview-head">
          <div>
            <div class="settings-subhead" style="margin:0;">Last Import Report</div>
            <p class="settings-hint" style="margin-top:6px;">
              ${report.totals.imported} imported, ${report.totals.cloned} cloned, ${report.totals.replaced} replaced, ${report.totals.skipped} skipped.
            </p>
          </div>
        </div>
        <div class="import-preview-summary">
          <span class="import-summary-pill success">Processed ${report.totals.processed}</span>
          <span class="import-summary-pill">Remapped ${report.remappedIds.length}</span>
        </div>
        <div class="import-report-list">${rows}</div>
      </div>
    `;
  }

  function renderImportPreview() {
    if (!importPreviewState) {
      importPreviewEl.innerHTML = renderImportReport();
      updateImportButton();
      return;
    }

    const { preview } = importPreviewState;
    const decisionItems = preview.items.filter(item => item.status !== 'new');
    const selectedCount = getImportSelectionCount();
    const rows = decisionItems.length
      ? decisionItems.map(item => `
          <div class="import-item-row">
            <div class="import-item-main">
              <div class="import-item-top">
                <span class="export-type-badge ${item.type}">${importTypeLabel[item.type] || item.type}</span>
                <span class="import-item-label">${escHtml(item.label || item.sourceId || 'Untitled')}</span>
                <span class="import-item-status ${item.status}">${importStatusLabel[item.status] || item.status}</span>
              </div>
              <div class="import-item-meta">
                Incoming ID: <code>${escHtml(item.sourceId || 'none')}</code>
                ${item.existingCampaignId ? ` · Existing campaign: <code>${escHtml(item.existingCampaignId)}</code>` : ''}
                ${item.existingLabel ? ` · Existing record: ${escHtml(item.existingLabel)}` : ''}
              </div>
            </div>
            <label class="import-action-select-wrap">
              <span>Action</span>
              <select data-import-item-key="${escAttr(item.key)}" class="import-action-select">
                ${item.availableActions.map(action => `
                  <option value="${action}" ${getImportAction(item) === action ? 'selected' : ''}>${importActionLabel[action] || action}</option>
                `).join('')}
              </select>
            </label>
          </div>
        `).join('')
      : '<p class="settings-hint" style="margin:10px 0 0;">No duplicates or conflicts. Everything in this file is ready to import as-is.</p>';

    importPreviewEl.innerHTML = `
      <div class="import-preview-panel">
        <div class="import-preview-head">
          <div>
            <div class="settings-subhead" style="margin:0;">Import Preview</div>
            <p class="settings-hint" style="margin-top:6px;">
              Review duplicates and conflicts before writing anything. New records will import unchanged.
            </p>
          </div>
        </div>
        <div class="import-preview-summary">
          <span class="import-summary-pill success">${preview.counts.new} new</span>
          <span class="import-summary-pill warn">${preview.counts.duplicate} duplicates</span>
          <span class="import-summary-pill danger">${preview.counts.conflict} conflicts</span>
          <span class="import-summary-pill">${preview.counts['missing-id']} missing IDs</span>
          <span class="import-summary-pill accent">${selectedCount} selected</span>
        </div>
        <div class="import-defaults-row">
          <label class="import-action-select-wrap">
            <span>Duplicates</span>
            <select data-import-default-status="duplicate" class="import-action-select">
              <option value="skip" ${importPreviewState.resolution.defaults.duplicate === 'skip' ? 'selected' : ''}>Skip</option>
              <option value="clone" ${importPreviewState.resolution.defaults.duplicate === 'clone' ? 'selected' : ''}>Clone With New ID</option>
              <option value="replace" ${importPreviewState.resolution.defaults.duplicate === 'replace' ? 'selected' : ''}>Replace Existing</option>
            </select>
          </label>
          <label class="import-action-select-wrap">
            <span>Conflicts</span>
            <select data-import-default-status="conflict" class="import-action-select">
              <option value="clone" ${importPreviewState.resolution.defaults.conflict === 'clone' ? 'selected' : ''}>Clone With New ID</option>
              <option value="skip" ${importPreviewState.resolution.defaults.conflict === 'skip' ? 'selected' : ''}>Skip</option>
              <option value="replace" ${importPreviewState.resolution.defaults.conflict === 'replace' ? 'selected' : ''}>Replace Existing</option>
            </select>
          </label>
        </div>
        <div class="import-item-list">${rows}</div>
      </div>
      ${renderImportReport()}
    `;

    importPreviewEl.querySelectorAll('[data-import-default-status]').forEach(select => {
      select.addEventListener('change', () => {
        importPreviewState.resolution.defaults[select.dataset.importDefaultStatus] = select.value;
        renderImportPreview();
      });
    });
    importPreviewEl.querySelectorAll('[data-import-item-key]').forEach(select => {
      select.addEventListener('change', () => {
        importPreviewState.resolution.overrides[select.dataset.importItemKey] = select.value;
        renderImportPreview();
      });
    });

    updateImportButton();
  }

  async function loadImportPreview(bundle) {
    const res = await fetch('/api/settings/import-preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bundle),
    });
    const preview = await res.json();
    if (!res.ok) throw new Error(preview.error || 'Preview failed');
    importPreviewState = {
      preview,
      resolution: {
        defaults: {
          duplicate: 'skip',
          conflict: 'clone',
          'missing-id': 'clone',
        },
        overrides: {},
      },
    };
    renderImportPreview();
  }

  fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];
    if (!file) {
      fileNameEl.textContent = 'No file selected';
      importFileData = null;
      importPreviewState = null;
      renderImportPreview();
      return;
    }

    fileNameEl.textContent = file.name;
    importPreviewEl.innerHTML = '<p class="settings-hint" style="margin-top:12px;">Analyzing import file…</p>';
    importBtn.disabled = true;
    const reader = new FileReader();

    reader.onload = async e => {
      try {
        importFileData = JSON.parse(e.target.result);
        if (!importFileData.sessions && !importFileData.encounters && !importFileData.npcs && !importFileData.locations && !importFileData.factions) {
          throw new Error('Invalid format');
        }
        await loadImportPreview(importFileData);
      } catch {
        fileNameEl.textContent = 'Invalid JSON file';
        importFileData = null;
        importPreviewState = null;
        renderImportPreview();
      }
    };
    reader.readAsText(file);
  });

  importBtn.addEventListener('click', async () => {
    if (!importFileData || !importPreviewState) return;
    importBtn.disabled = true;
    importBtn.textContent = 'Importing…';
    try {
      const res = await fetch('/api/settings/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessions:   importFileData.sessions   || [],
          encounters: importFileData.encounters || [],
          npcs: importFileData.npcs || [],
          locations: importFileData.locations || [],
          factions: importFileData.factions || [],
          resolution: importPreviewState.resolution,
        }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Import failed');
      importReportState = result.report || null;
      showToast(
        `Imported ${result.report?.totals.imported || 0}, cloned ${result.report?.totals.cloned || 0}, replaced ${result.report?.totals.replaced || 0}, skipped ${result.report?.totals.skipped || 0}.`,
        'success'
      );
      fileInput.value = '';
      fileNameEl.textContent = 'No file selected';
      importFileData = null;
      importPreviewState = null;
      renderImportPreview();
      loadExportList();
      loadBackups();
      loadLifecycleRecords();
    } catch (err) {
      showToast('Import failed: ' + err.message, 'error');
    } finally {
      updateImportButton();
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

  const lifecycleRefreshBtn = document.getElementById('btn-lifecycle-refresh');
  if (lifecycleRefreshBtn) {
    lifecycleRefreshBtn.addEventListener('click', () => {
      loadLifecycleRecords();
    });
  }

  const emptyTrashBtn = document.getElementById('btn-empty-trash');
  if (emptyTrashBtn) {
    emptyTrashBtn.addEventListener('click', async () => {
      const trashed = lifecycleItems.filter(item => item.status === 'trashed').map(item => ({ type: item.type, id: item.id }));
      if (!trashed.length) {
        showToast('Trash is already empty.', 'success');
        return;
      }
      const ok = await showConfirm(
        `Permanently delete ${trashed.length} trashed record(s)? This cannot be undone.`,
        { title: 'Empty Trash', confirmLabel: 'Delete Permanently', danger: true }
      );
      if (!ok) return;
      try {
        await deleteLifecycleItems(trashed, `Deleted ${trashed.length} trashed record(s).`);
      } catch (err) {
        showToast('Delete failed: ' + err.message, 'error');
      }
    });
  }

  loadExportList();
  loadBackups();
  loadLifecycleRecords();
  buildSettingsNav();

  let toastTimer = null;

  function showToast(msg, type = 'success') {
    const t = document.getElementById('toast');
    if (!t) return;
    clearTimeout(toastTimer);
    t.innerHTML = '';
    const span = document.createElement('span');
    span.textContent = msg;
    t.appendChild(span);
    t.className = `toast ${type} show`;
    toastTimer = setTimeout(() => { t.className = 'toast'; }, 4000);
  }

  function showToastWithAction(msg, type, actionLabel, onAction) {
    const t = document.getElementById('toast');
    if (!t) return;
    clearTimeout(toastTimer);
    t.innerHTML = '';
    const span = document.createElement('span');
    span.textContent = msg;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'toast-action';
    btn.textContent = actionLabel;
    btn.addEventListener('click', async () => {
      t.className = 'toast';
      await onAction();
    });
    t.appendChild(span);
    t.appendChild(btn);
    t.className = `toast toast-has-action ${type} show`;
    toastTimer = setTimeout(() => { t.className = 'toast'; }, 6000);
  }
})();
