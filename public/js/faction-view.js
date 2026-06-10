(async function () {
  const id = location.pathname.split('/').pop();
  const content = document.getElementById('faction-content');

  let faction;
  let linkedSessionDetails = [];
  let linkedEncounterDetails = [];
  let linkedNpcDetails = [];
  let linkedLocationDetails = [];

  try {
    const [res] = await Promise.all([
      fetch(`/api/factions/${id}`),
      WikiLinks.preload(),
    ]);
    if (!res.ok) throw new Error('Not found');
    faction = await res.json();
  } catch {
    content.innerHTML = '<div class="empty-state"><p>Faction not found.</p><a href="/factions" class="btn btn-ghost">← Back to Factions</a></div>';
    return;
  }

  document.title = `${faction.name} — D&D Session Master`;

  if (
    faction.linkedSessions?.length ||
    faction.linkedEncounters?.length ||
    faction.linkedNpcs?.length ||
    faction.linkedLocations?.length
  ) {
    try {
      const [sessionRes, encounterRes, npcRes, locationRes] = await Promise.all([
        fetch(`/api/factions/${id}/linked-sessions`),
        fetch(`/api/factions/${id}/linked-encounters`),
        fetch(`/api/factions/${id}/linked-npcs`),
        fetch(`/api/factions/${id}/linked-locations`),
      ]);
      if (sessionRes.ok) linkedSessionDetails = await sessionRes.json();
      if (encounterRes.ok) linkedEncounterDetails = await encounterRes.json();
      if (npcRes.ok) linkedNpcDetails = await npcRes.json();
      if (locationRes.ok) linkedLocationDetails = await locationRes.json();
    } catch {}
  }

  content.innerHTML = buildHTML(faction);

  buildToc();
  mountTagEditor(id, faction.tags || [], '/api/factions');
  setupConnectionsPanel(faction, linkedSessionDetails, linkedEncounterDetails, linkedNpcDetails, linkedLocationDetails);
  setupDraftActions(faction, id);

  document.getElementById('btn-edit').addEventListener('click', () => {
    location.href = `/faction/edit/${id}`;
  });
  document.getElementById('btn-delete').addEventListener('click', () => deleteFaction(id));

  document.getElementById('btn-export').addEventListener('click', () => {
    ExportDialog.open({
      title: 'Export Faction',
      loadFiles: async () => {
        const res = await fetch('/api/factions/export', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(faction),
        });
        const result = await res.json();
        if (!res.ok) throw new Error(result.error || 'Generation failed');
        return [{
          filename: result.filename,
          displayName: faction.name || result.filename,
          type: 'faction',
          markdown: result.markdown,
          pdf: result.pdf,
        }];
      },
    });
  });

  document.getElementById('btn-export-connections').addEventListener('click', () => {
    ExportDialog.open({
      title: 'Export Faction with Connections',
      loadFiles: async () => {
        const files = [];

        const factionRes = await fetch('/api/factions/export', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(faction),
        });
        const factionResult = await factionRes.json();
        if (!factionRes.ok) throw new Error(factionResult.error || 'Generation failed');
        files.push({
          filename: factionResult.filename,
          displayName: faction.name || factionResult.filename,
          type: 'faction',
          markdown: factionResult.markdown,
          pdf: factionResult.pdf,
        });

        const sessionJobs = (linkedSessionDetails || [])
          .filter(session => session.exists !== false)
          .map(async session => {
            const sessionRes = await fetch(`/api/sessions/${encodeURIComponent(session.id)}`);
            if (!sessionRes.ok) return null;
            const sessionData = await sessionRes.json();
            const previewRes = await fetch('/api/sessions/preview', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(sessionData.data),
            });
            const preview = await previewRes.json();
            if (!previewRes.ok) return null;
            return {
              filename: preview.filename,
              displayName: session.sessionNumber ? `Session ${String(session.sessionNumber).padStart(3, '0')}` : (session.goal || session.id),
              type: 'session',
              markdown: preview.markdown,
              pdf: preview.pdf,
            };
          });

        const encounterJobs = (linkedEncounterDetails || [])
          .filter(encounter => encounter.exists !== false)
          .map(async encounter => {
            const encounterRes = await fetch(`/api/encounters/${encodeURIComponent(encounter.id)}`);
            if (!encounterRes.ok) return null;
            const encounterData = await encounterRes.json();
            const previewRes = await fetch('/api/encounters/preview', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(encounterData.data),
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

        const npcJobs = (linkedNpcDetails || [])
          .filter(npc => npc.exists !== false)
          .map(async npc => {
            const npcRes = await fetch(`/api/npcs/${encodeURIComponent(npc.id)}`);
            if (!npcRes.ok) return null;
            const npcData = await npcRes.json();
            const exportRes = await fetch('/api/npcs/export', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(npcData),
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

        const locationJobs = (linkedLocationDetails || [])
          .filter(location => location.exists !== false)
          .map(async location => {
            const locationRes = await fetch(`/api/locations/${encodeURIComponent(location.id)}`);
            if (!locationRes.ok) return null;
            const locationData = await locationRes.json();
            const exportRes = await fetch('/api/locations/export', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(locationData),
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

        const [sessionResults, encounterResults, npcResults, locationResults] = await Promise.all([
          Promise.allSettled(sessionJobs),
          Promise.allSettled(encounterJobs),
          Promise.allSettled(npcJobs),
          Promise.allSettled(locationJobs),
        ]);

        [sessionResults, encounterResults, npcResults, locationResults].forEach(results => {
          results.forEach(result => {
            if (result.status === 'fulfilled' && result.value) files.push(result.value);
          });
        });

        return files;
      },
    });
  });
})();

function setupDraftActions(faction, id) {
  const promoteBtn = document.getElementById('btn-promote-draft');
  if (!promoteBtn || faction.status !== 'draft') return;
  promoteBtn.classList.remove('hidden');
  promoteBtn.addEventListener('click', async () => {
    promoteBtn.disabled = true;
    promoteBtn.textContent = 'Promoting…';
    try {
      const res = await fetch(`/api/factions/${id}/state`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'active' }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Promotion failed');
      showToast('Draft promoted to faction.', 'success');
      setTimeout(() => location.reload(), 700);
    } catch (err) {
      showToast('Promote failed: ' + err.message, 'error');
      promoteBtn.disabled = false;
      promoteBtn.textContent = 'Promote Draft';
    }
  });
}

function buildHTML(faction) {
  const parts = [];

  parts.push(`
    <div class="npc-view-header" id="faction-section-identity">
      <h1 class="npc-view-name">${esc(faction.name)}</h1>
      <div id="faction-tags-container" class="npc-view-tags"></div>
    </div>`);

  const snapshotItems = [
    faction.origin ? ['Origin', faction.origin] : null,
    faction.size !== '' && faction.size != null ? ['Size', String(faction.size)] : null,
    ['Party Reputation', reputationLabel(faction.partyReputation)],
  ].filter(Boolean);

  if (snapshotItems.length) {
    parts.push(`<div class="npc-view-section" id="faction-section-snapshot">
      <div class="npc-view-section-label">Snapshot</div>
      <div class="npc-core-grid">${snapshotItems.map(([label, value]) => `
        <div class="npc-core-item">
          <div class="npc-core-label">${esc(label)}</div>
          <p class="npc-view-prose">${WikiLinks.render(value)}</p>
        </div>
      `).join('')}</div>
    </div>`);
  }

  if (faction.goal) {
    parts.push(`
      <div class="npc-view-section" id="faction-section-goal">
        <div class="npc-view-section-label">Goal</div>
        <p class="npc-view-prose">${WikiLinks.render(faction.goal)}</p>
      </div>`);
  }

  const clocks = (faction.factionClocks || []).filter(clock =>
    clock.name || clock.advanceTrigger || clock.setbackTrigger || (clock.stepDescriptions || []).some(Boolean)
  );
  if (clocks.length) {
    parts.push(`<div class="npc-view-section" id="faction-section-clocks">
      <div class="npc-view-section-label">Faction Clocks</div>
      <div class="npc-skills-view-grid">${clocks.map(clock => `
        <div class="npc-skill-card faction-view-clock-card">
          <div class="npc-skill-label">${esc(clock.name || 'Unnamed Clock')} <span class="npc-skill-sub">(${esc(String(clock.steps || (clock.stepDescriptions || []).length || 0))} step${Number(clock.steps || (clock.stepDescriptions || []).length || 0) === 1 ? '' : 's'})</span></div>
          ${clock.advanceTrigger ? `<p class="npc-view-prose"><strong>Advances:</strong> ${WikiLinks.render(clock.advanceTrigger)}</p>` : ''}
          ${clock.setbackTrigger ? `<p class="npc-view-prose"><strong>Setbacks:</strong> ${WikiLinks.render(clock.setbackTrigger)}</p>` : ''}
          ${(clock.stepDescriptions || []).some(Boolean)
            ? `<ol class="faction-view-step-list">${clock.stepDescriptions.map((step, index) => `
                <li>
                  <span class="faction-view-step-num">${index + 1}.</span>
                  <span>${WikiLinks.render(step || 'No change noted for this step yet.')}</span>
                </li>
              `).join('')}</ol>`
            : '<p class="npc-view-prose">No step changes recorded yet.</p>'}
        </div>
      `).join('')}</div>
    </div>`);
  }

  return `<div class="npc-view-body">${parts.join('\n')}</div>`;
}

function buildToc() {
  const toc = document.getElementById('toc-nav');
  if (!toc) return;
  const sections = [
    ['faction-section-identity', 'Identity'],
    ['faction-section-snapshot', 'Snapshot'],
    ['faction-section-goal', 'Goal'],
    ['faction-section-clocks', 'Clocks'],
  ];
  const links = sections
    .filter(([id]) => document.getElementById(id))
    .map(([id, label]) => `<a href="#${id}" class="toc-link">${esc(label)}</a>`)
    .join('');
  if (links) toc.innerHTML = `<div class="toc-inner"><p class="toc-head">Contents</p>${links}</div>`;
}

function mountTagEditor(id, initialTags, apiBase) {
  const container = document.getElementById('faction-tags-container');
  if (!container) return;
  new TagInput(container, initialTags, {
    onUpdate: async tags => {
      await fetch(`${apiBase}/${id}/tags`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tags }),
      });
    },
  });
}

function setupConnectionsPanel(faction, linkedSessionDetails, linkedEncounterDetails, linkedNpcDetails, linkedLocationDetails) {
  const btn = document.getElementById('btn-connections');
  if (!btn || !window.RecordConnectionsPanel) return;
  btn.addEventListener('click', () => {
    window.RecordConnectionsPanel.open({
      title: `${faction.name} Connections`,
      subtitle: 'All sessions, encounter plans, NPCs, and locations currently linked to this faction.',
      sections: [
        {
          title: 'Linked Sessions',
          empty: 'No linked sessions yet.',
          items: (linkedSessionDetails || []).map(session => ({
            label: session.sessionNumber ? `Session ${String(session.sessionNumber).padStart(3, '0')}` : session.id,
            meta: `${session.goal || session.id}${session.exists ? '' : ' · missing session'}`,
            url: `/view/${session.id}`,
            exists: session.exists,
          })),
        },
        {
          title: 'Linked Encounter Plans',
          empty: 'No linked encounter plans yet.',
          items: (linkedEncounterDetails || []).map(encounter => ({
            label: encounter.name || encounter.id,
            meta: `${encounter.id}${encounter.fiction ? ` · ${encounter.fiction.slice(0, 72)}` : ''}${encounter.exists ? '' : ' · missing plan'}`,
            url: `/encounter/view/${encounter.id}`,
            exists: encounter.exists,
          })),
        },
        {
          title: 'Linked NPCs',
          empty: 'No linked NPCs yet.',
          items: (linkedNpcDetails || []).map(npc => ({
            label: npc.name || npc.id,
            meta: `${npc.id}${npc.nickname ? ` · "${npc.nickname}"` : ''}${npc.exists ? '' : ' · missing NPC'}`,
            url: `/npc/view/${npc.id}`,
            exists: npc.exists,
          })),
        },
        {
          title: 'Linked Locations',
          empty: 'No linked locations yet.',
          items: (linkedLocationDetails || []).map(location => ({
            label: location.name || location.id,
            meta: `${location.id}${location.description ? ` · ${location.description.slice(0, 72)}` : ''}${location.exists ? '' : ' · missing location'}`,
            url: `/location/view/${location.id}`,
            exists: location.exists,
          })),
        },
      ],
    });
  });
}

async function deleteFaction(id) {
  const ok = await showConfirm('Move this faction to trash? You can restore it later from Settings.', {
    title: 'Move Faction to Trash',
    confirmLabel: 'Move to Trash',
    danger: true,
  });
  if (!ok) return;
  try {
    const res = await fetch(`/api/factions/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error((await res.json()).error || 'Move to trash failed');
    showToast('Faction moved to trash.', 'success');
    setTimeout(() => { location.href = '/factions'; }, 900);
  } catch (err) {
    showToast('Delete failed: ' + err.message, 'error');
  }
}

function reputationLabel(value) {
  const score = Number(value) || 0;
  const labels = {
    '-3': 'Hostile',
    '-2': 'Distrusted',
    '-1': 'Cold',
    '0': 'Neutral',
    '1': 'Warm',
    '2': 'Trusted',
    '3': 'Allied',
  };
  return `${score > 0 ? '+' : ''}${score} ${labels[String(score)] || ''}`.trim();
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
