(async function () {
  const id      = location.pathname.split('/').pop();
  const content = document.getElementById('content');

  let encounter;
  let linkedSessions = [];
  let linkedNpcs = [];
  try {
    const [encounterRes, linksRes, npcRes] = await Promise.all([
      fetch(`/api/encounters/${id}`),
      fetch(`/api/encounters/${id}/links`),
      fetch(`/api/encounters/${id}/linked-npcs`),
    ]);
    if (!encounterRes.ok) throw new Error('Not found');
    encounter = await encounterRes.json();
    linkedSessions = linksRes.ok ? await linksRes.json() : [];
    linkedNpcs = npcRes.ok ? await npcRes.json() : [];
  } catch {
    content.innerHTML = '<div class="empty-state"><p>Encounter plan not found.</p><a href="/encounters" class="btn btn-ghost">← Back</a></div>';
    return;
  }

  document.title = `${encounter.name} — D&D Session Master`;
  content.innerHTML = `<div class="markdown-body">${marked.parse(encounter.markdown || '')}</div>`;
  buildMarkdownToc();
  mountTagEditor(id, encounter.data?.tags || [], '/api/encounters', '#tags-anchor');
  setupConnectionsPanel(encounter, linkedSessions, linkedNpcs);

  document.getElementById('btn-edit').addEventListener('click', () => {
    location.href = `/encounter/edit/${id}`;
  });

  document.getElementById('btn-export').addEventListener('click', () => {
    ExportDialog.open({
      title: 'Export Encounter Plan',
      loadFiles: async () => {
        const res = await fetch('/api/encounters/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(encounter.data),
        });
        const result = await res.json();
        if (!res.ok) throw new Error(result.error || 'Generation failed');
        return [{ filename: result.filename, type: 'encounter', markdown: result.markdown, pdf: result.pdf }];
      },
    });
  });

  document.getElementById('btn-export-connections').addEventListener('click', () => {
    ExportDialog.open({
      title: 'Export Encounter with Connections',
      loadFiles: async () => {
        const files = [];

        const encRes = await fetch('/api/encounters/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(encounter.data),
        });
        const encResult = await encRes.json();
        if (!encRes.ok) throw new Error(encResult.error || 'Generation failed');
        files.push({ filename: encResult.filename, type: 'encounter', markdown: encResult.markdown, pdf: encResult.pdf });

        const npcJobs = linkedNpcs
          .filter(l => l.exists)
          .map(async link => {
            const npcRes = await fetch(`/api/npcs/${encodeURIComponent(link.id)}`);
            if (!npcRes.ok) return null;
            const npc = await npcRes.json();
            const genRes = await fetch('/api/npcs/export', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(npc),
            });
            const genResult = await genRes.json();
            if (!genRes.ok) return null;
            return { filename: genResult.filename, type: 'npc', markdown: genResult.markdown, pdf: genResult.pdf };
          });

        const results = await Promise.allSettled(npcJobs);
        results.forEach(r => { if (r.status === 'fulfilled' && r.value) files.push(r.value); });

        return files;
      },
    });
  });

  document.getElementById('btn-delete').addEventListener('click', () => deleteEncounter(id));
})();

function setupConnectionsPanel(encounter, linkedSessions, linkedNpcs) {
  const btn = document.getElementById('btn-connections');
  if (!btn || !window.RecordConnectionsPanel) return;
  btn.addEventListener('click', () => {
    window.RecordConnectionsPanel.open({
      title: `${encounter.name || encounter.id} Connections`,
      subtitle: 'All records currently linked to this encounter plan.',
      sections: [
        {
          title: 'Linked Sessions',
          empty: 'No linked sessions yet.',
          items: linkedSessions.map(link => ({
            label: link.sessionNumber ? `Session ${String(link.sessionNumber).padStart(3, '0')}` : link.id,
            meta: `${link.goal || link.id}${link.exists ? '' : ' · missing session'}`,
            url: `/view/${link.id}`,
            exists: link.exists,
          })),
        },
        {
          title: 'Linked NPCs',
          empty: 'No linked NPCs yet.',
          items: linkedNpcs.map(npc => ({
            label: npc.name || npc.id,
            meta: `${npc.id}${npc.nickname ? ` · "${npc.nickname}"` : ''}`,
            url: `/npc/view/${npc.id}`,
            exists: npc.exists,
          })),
        },
      ],
    });
  });
}


async function deleteEncounter(id) {
  const ok = await showConfirm(`Delete this encounter plan? This cannot be undone.`, {
    title: 'Delete Encounter Plan',
    confirmLabel: 'Delete',
    danger: true,
  });
  if (!ok) return;

  try {
    const res = await fetch(`/api/encounters/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error((await res.json()).error || 'Delete failed');
    showToast('Encounter plan deleted.', 'success');
    setTimeout(() => { location.href = '/encounters'; }, 1000);
  } catch (err) {
    showToast('Delete failed: ' + err.message, 'error');
  }
}
