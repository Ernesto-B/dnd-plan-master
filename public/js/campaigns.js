let campaignsData = { campaigns: [], activeCampaignId: null };

function slugifyName(value, fallback = 'campaign') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || fallback;
}

async function buildCampaignExportFiles(id, name) {
  const res = await fetch(`/api/campaigns/${encodeURIComponent(id)}/export`);
  const bundle = await res.json();
  if (!res.ok) throw new Error(bundle.error || 'Export failed');

  const files = [];
  const bundleName = `${slugifyName(name)}-export-${new Date().toISOString().slice(0, 10)}`;

  files.push({
    filename: bundleName,
    displayName: `${name} Campaign Bundle`,
    type: 'bundle',
    json: JSON.stringify(bundle, null, 2),
  });

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

  const results = await Promise.all([
    Promise.allSettled(sessionJobs),
    Promise.allSettled(encounterJobs),
    Promise.allSettled(npcJobs),
    Promise.allSettled(locationJobs),
  ]);

  results.flat().forEach(result => {
    if (result.status === 'fulfilled' && result.value) files.push(result.value);
  });

  return files;
}

(async function () {
  await loadCampaigns();

  document.getElementById('btn-new-campaign').addEventListener('click', async () => {
    const name = await showPrompt('Give this campaign a name.', {
      title: 'New Campaign',
      confirmLabel: 'Create',
      placeholder: 'The Saltmarsh Chronicles',
    });
    if (!name) return;

    try {
      const res = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Create failed');
      showToast(`Campaign "${result.name}" created.`, 'success');
      await loadCampaigns();
    } catch (err) {
      showToast('Failed to create campaign: ' + err.message, 'error');
    }
  });

  document.getElementById('btn-generate-demo').addEventListener('click', async () => {
    const ok = await showConfirm(
      'This recreates the "Demo Campaign" with its example sessions, NPCs, locations, and encounters. It will appear alongside your other campaigns — you can switch to it or delete it whenever you like.',
      { title: 'Generate Demo Campaign', confirmLabel: 'Generate' }
    );
    if (!ok) return;

    try {
      const res = await fetch('/api/campaigns/demo/generate', { method: 'POST' });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Generation failed');
      showToast(`"${result.campaign.name}" created.`, 'success');
      await loadCampaigns();
    } catch (err) {
      showToast('Failed to generate demo campaign: ' + err.message, 'error');
    }
  });

  const importInput = document.getElementById('campaign-import-input');
  importInput.addEventListener('change', () => {
    const file = importInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async e => {
      let bundle;
      try {
        bundle = JSON.parse(e.target.result);
        if (!bundle.campaign || !Array.isArray(bundle.sessions)) throw new Error('Invalid format');
      } catch {
        showToast('That file does not look like a campaign export.', 'error');
        importInput.value = '';
        return;
      }

      const counts = `${bundle.sessions.length} session(s), ${(bundle.encounters || []).length} encounter(s), ${(bundle.npcs || []).length} NPC(s), ${(bundle.locations || []).length} location(s)`;
      const ok = await showConfirm(
        `Import "${bundle.campaign.name || 'Imported Campaign'}" as a new campaign? This will create a new campaign containing ${counts} and its party roster.`,
        { title: 'Import Campaign', confirmLabel: 'Import' }
      );
      if (!ok) { importInput.value = ''; return; }

      try {
        const res = await fetch('/api/campaigns/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(bundle),
        });
        const result = await res.json();
        if (!res.ok) throw new Error(result.error || 'Import failed');
        showToast(
          `Imported "${result.campaign.name}" — ${result.importedSessions} session(s), ${result.importedEncounters} encounter(s), ${result.importedNpcs} NPC(s), ${result.importedLocations || 0} location(s).`,
          'success'
        );
        await loadCampaigns();
      } catch (err) {
        showToast('Import failed: ' + err.message, 'error');
      } finally {
        importInput.value = '';
      }
    };
    reader.readAsText(file);
  });
})();

async function exportCampaign(id, name) {
  ExportDialog.open({
    title: `Export Campaign: ${name}`,
    formatOptions: [
      { id: 'md', label: 'Markdown', ext: '.md', checked: true },
      { id: 'pdf', label: 'PDF', ext: '.pdf', checked: true },
      { id: 'json', label: 'JSON Bundle', ext: '.json', checked: true },
    ],
    loadFiles: async () => buildCampaignExportFiles(id, name),
  });
}

async function loadCampaigns() {
  try {
    const res = await fetch('/api/campaigns');
    campaignsData = await res.json();
    renderCampaigns();
  } catch {
    document.getElementById('campaign-list-container').innerHTML =
      '<div class="empty-state"><p>Could not load campaigns.</p></div>';
  }
}

function renderCampaigns() {
  const container = document.getElementById('campaign-list-container');
  const { campaigns, activeCampaignId } = campaignsData;

  document.getElementById('btn-generate-demo').style.display =
    campaigns.some(c => c.isDemo) ? 'none' : '';

  if (!campaigns.length) {
    container.innerHTML = '<div class="empty-state"><p>No campaigns yet.</p></div>';
    return;
  }

  container.innerHTML = campaigns.map(c => {
    const isActive = c.id === activeCampaignId;
    return `
      <div class="campaign-row${isActive ? ' is-active' : ''}" data-id="${esc(c.id)}">
        <div class="campaign-row-main">
          <div class="campaign-row-name">
            ${isActive ? '<span class="campaign-active-badge">Active</span>' : ''}
            ${c.isDemo ? '<span class="campaign-demo-badge">Demo</span>' : ''}
            ${esc(c.name)}
          </div>
          ${c.description ? `<div class="campaign-row-desc">${esc(c.description)}</div>` : ''}
          <div class="campaign-row-meta">Created ${formatDate(c.createdAt)}</div>
        </div>
        <div class="campaign-row-actions">
          ${!isActive ? `<button class="btn btn-ghost btn-sm campaign-switch" data-id="${esc(c.id)}">Switch To</button>` : '<span class="campaign-current-label">Current</span>'}
          <button class="btn btn-ghost btn-sm campaign-rename" data-id="${esc(c.id)}" data-name="${esc(c.name)}">Rename</button>
          <button class="btn btn-ghost btn-sm campaign-export" data-id="${esc(c.id)}" data-name="${esc(c.name)}">Export…</button>
          ${campaigns.length > 1 ? `<button class="btn btn-ghost btn-sm campaign-delete" data-id="${esc(c.id)}" data-name="${esc(c.name)}" style="color:var(--danger)">Delete</button>` : ''}
        </div>
      </div>`;
  }).join('');

  container.querySelectorAll('.campaign-switch').forEach(btn => {
    btn.addEventListener('click', () => switchCampaign(btn.dataset.id));
  });
  container.querySelectorAll('.campaign-rename').forEach(btn => {
    btn.addEventListener('click', () => renameCampaign(btn.dataset.id, btn.dataset.name));
  });
  container.querySelectorAll('.campaign-export').forEach(btn => {
    btn.addEventListener('click', () => exportCampaign(btn.dataset.id, btn.dataset.name));
  });
  container.querySelectorAll('.campaign-delete').forEach(btn => {
    btn.addEventListener('click', () => deleteCampaign(btn.dataset.id, btn.dataset.name));
  });
}

async function switchCampaign(id) {
  try {
    const res = await fetch(`/api/campaigns/${encodeURIComponent(id)}/switch`, { method: 'POST' });
    if (!res.ok) throw new Error((await res.json()).error || 'Switch failed');
    window.location.href = '/';
  } catch (err) {
    showToast('Switch failed: ' + err.message, 'error');
  }
}

async function renameCampaign(id, currentName) {
  const name = await showPrompt('Enter a new name for this campaign.', {
    title: 'Rename Campaign',
    confirmLabel: 'Save',
    defaultValue: currentName,
    placeholder: 'Campaign name',
  });
  if (!name) return;

  try {
    const res = await fetch(`/api/campaigns/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Rename failed');
    showToast('Campaign renamed.', 'success');
    await loadCampaigns();
  } catch (err) {
    showToast('Rename failed: ' + err.message, 'error');
  }
}

async function deleteCampaign(id, name) {
  const isActive = id === campaignsData.activeCampaignId;
  const warning = isActive
    ? `"${name}" is your active campaign. All its sessions, encounters, and NPCs will be permanently deleted. This cannot be undone.`
    : `Delete "${name}"? All sessions, encounters, and NPCs in this campaign will be permanently deleted. This cannot be undone.`;

  const ok = await showConfirm(warning, {
    title: `Delete ${name}`,
    confirmLabel: 'Delete Campaign',
    danger: true,
  });
  if (!ok) return;

  try {
    const res = await fetch(`/api/campaigns/${encodeURIComponent(id)}`, { method: 'DELETE' });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Delete failed');
    showToast(`Campaign deleted.`, 'success');
    if (isActive) {
      window.location.href = '/';
    } else {
      await loadCampaigns();
    }
  } catch (err) {
    showToast('Delete failed: ' + err.message, 'error');
  }
}

function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function esc(s) {
  const d = document.createElement('div');
  d.textContent = String(s ?? '');
  return d.innerHTML;
}

function showToast(msg, type = 'success') {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.className = `toast ${type} show`;
  setTimeout(() => { t.className = 'toast'; }, 5000);
}
