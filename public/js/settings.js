(async function () {
  // ─── Theme toggle ─────────────────────────────────────────────────────────────
  const themeBtn = document.getElementById('btn-theme-toggle');
  const autosaveBtn = document.getElementById('btn-autosave-toggle');
  let autosaveEnabled = true;

  function applyTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    localStorage.setItem('dnd-theme', t);
    themeBtn.textContent = t === 'dark' ? '☀ Switch to Light' : '☽ Switch to Dark';
  }

  function applyAutosave(enabled) {
    autosaveEnabled = !!enabled;
    autosaveBtn.textContent = autosaveEnabled ? 'On' : 'Off';
  }

  applyTheme(localStorage.getItem('dnd-theme') || 'dark');
  themeBtn.addEventListener('click', () => {
    applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
  });
  autosaveBtn.addEventListener('click', () => applyAutosave(!autosaveEnabled));

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

  // Load existing settings
  try {
    const res = await fetch('/api/settings');
    const settings = await res.json();
    if (settings.theme) applyTheme(settings.theme);
    applyAutosave(settings.autosaveEnabled !== false);
    (settings.party || []).forEach(p => list.appendChild(makePlayerRow(p)));
  } catch {
    // start empty
    applyAutosave(true);
  }

  document.getElementById('btn-add-player').addEventListener('click', () => {
    list.appendChild(makePlayerRow());
  });

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
          autosaveEnabled,
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

  // Maps for "Select All Related"
  // sessionToEncounters: sessionId → Set of encounter IDs
  // encounterToSession:  encounterId → sessionId
  const sessionToEncounters = new Map();
  const encounterToSession  = new Map();

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

    if (!exportData.sessions.length && !exportData.encounters.length) {
      listEl.innerHTML = `<p style="padding:12px; color:var(--muted); font-family:var(--font-body); font-style:italic;">No plans saved yet.</p>`;
      return;
    }

    listEl.innerHTML = '';
    for (const s of exportData.sessions) {
      listEl.appendChild(makeExportItem('session', s.id, s.goal || `Session #${s.sessionNumber}`));
    }
    for (const e of exportData.encounters) {
      listEl.appendChild(makeExportItem('encounter', e.id, e.name || e.id));
    }

    listEl.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      cb.addEventListener('change', updateExportButton);
    });
    updateExportButton();
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
    return [...document.querySelectorAll('#export-list input[type="checkbox"]:checked')].map(cb => ({
      id: cb.dataset.id, type: cb.dataset.type,
    }));
  }

  function updateExportButton() {
    const n = getCheckedIds().length;
    const btn = document.getElementById('btn-export-json');
    btn.textContent = `Export Selected (${n})`;
    btn.disabled = n === 0;
  }

  document.getElementById('btn-select-all').addEventListener('click', () => {
    document.querySelectorAll('#export-list input[type="checkbox"]').forEach(cb => { cb.checked = true; });
    updateExportButton();
  });

  document.getElementById('btn-deselect-all').addEventListener('click', () => {
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

  function showToast(msg, type = 'success') {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.className = `toast ${type} show`;
    setTimeout(() => { t.className = 'toast'; }, 4000);
  }
})();
