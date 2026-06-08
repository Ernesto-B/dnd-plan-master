(async function () {
  const id      = location.pathname.split('/').pop();
  const content = document.getElementById('location-content');

  let loc;
  try {
    const [res] = await Promise.all([
      fetch(`/api/locations/${id}`),
      WikiLinks.preload(),
    ]);
    if (!res.ok) throw new Error('Not found');
    loc = await res.json();
  } catch {
    content.innerHTML = '<div class="empty-state"><p>Location not found.</p><a href="/locations" class="btn btn-ghost">← Back to Locations</a></div>';
    return;
  }

  document.title = `${loc.name} — D&D Session Master`;

  // Fetch linked session details in parallel with rendering
  let linkedSessionDetails = [];
  if (loc.linkedSessions && loc.linkedSessions.length) {
    try {
      const res = await fetch(`/api/locations/${id}/linked-sessions`);
      if (res.ok) linkedSessionDetails = await res.json();
    } catch {}
  }

  content.innerHTML = buildHTML(loc);

  buildToc();

  mountTagEditor(id, loc.tags || [], '/api/locations');
  setupConnectionsPanel(loc, linkedSessionDetails);

  document.getElementById('btn-edit').addEventListener('click', () => {
    location.href = `/location/edit/${id}`;
  });
  document.getElementById('btn-delete').addEventListener('click', () => deleteLocation(id));

  document.getElementById('btn-export').addEventListener('click', () => {
    ExportDialog.open({
      title: 'Export Location',
      loadFiles: async () => {
        const res = await fetch('/api/locations/export', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(loc),
        });
        const result = await res.json();
        if (!res.ok) throw new Error(result.error || 'Generation failed');
        return [{
          filename: result.filename,
          displayName: loc.name || result.filename,
          type: 'location',
          markdown: result.markdown,
          pdf: result.pdf,
        }];
      },
    });
  });

  document.getElementById('btn-export-connections').addEventListener('click', () => {
    ExportDialog.open({
      title: 'Export Location with Connections',
      loadFiles: async () => {
        const files = [];

        const locRes = await fetch('/api/locations/export', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(loc),
        });
        const locResult = await locRes.json();
        if (!locRes.ok) throw new Error(locResult.error || 'Generation failed');
        files.push({
          filename: locResult.filename,
          displayName: loc.name || locResult.filename,
          type: 'location',
          markdown: locResult.markdown,
          pdf: locResult.pdf,
        });

        const sessionJobs = (linkedSessionDetails || [])
          .filter(s => s.exists !== false)
          .map(async sess => {
            const sessRes = await fetch(`/api/sessions/${encodeURIComponent(sess.id)}`);
            if (!sessRes.ok) return null;
            const sessData = await sessRes.json();
            const genRes = await fetch('/api/sessions/preview', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(sessData.data),
            });
            const genResult = await genRes.json();
            if (!genRes.ok) return null;
            return {
              filename: genResult.filename,
              displayName: sess.sessionNumber ? `Session ${String(sess.sessionNumber).padStart(3, '0')}` : (sess.goal || sess.id),
              type: 'session',
              markdown: genResult.markdown,
              pdf: genResult.pdf,
            };
          });

        const results = await Promise.allSettled(sessionJobs);
        results.forEach(r => { if (r.status === 'fulfilled' && r.value) files.push(r.value); });

        return files;
      },
    });
  });
})();

function buildHTML(loc) {
  const parts = [];

  // ─── Header ────────────────────────────────────────────────────────────────
  parts.push(`
    <div class="npc-view-header" id="loc-section-identity">
      <h1 class="npc-view-name">${esc(loc.name)}</h1>
      <div id="loc-tags-container" class="npc-view-tags"></div>
    </div>`);

  // ─── General ───────────────────────────────────────────────────────────────
  const generalItems = [
    loc.government           ? ['Government', loc.government]           : null,
    loc.populationSize       ? ['Population Size', loc.populationSize]  : null,
    loc.populationDiversity  ? ['Population Diversity', loc.populationDiversity] : null,
    loc.languages            ? ['Languages', loc.languages]             : null,
    loc.resources            ? ['Resources', loc.resources]             : null,
    loc.funFact              ? ['Fun Fact', loc.funFact]                : null,
  ].filter(Boolean);

  if (generalItems.length) {
    parts.push(`<div class="npc-view-section" id="loc-section-general">
      <div class="npc-view-section-label">General</div>
      <div class="npc-core-grid">${generalItems.map(([label, text]) =>
        `<div class="npc-core-item">
          <div class="npc-core-label">${esc(label)}</div>
          <p class="npc-view-prose">${WikiLinks.render(text)}</p>
        </div>`
      ).join('')}</div>
    </div>`);
  }

  // ─── Description ───────────────────────────────────────────────────────────
  if (loc.description) {
    parts.push(`
      <div class="npc-view-section" id="loc-section-description">
        <div class="npc-view-section-label">Description</div>
        <p class="npc-view-prose">${WikiLinks.render(loc.description)}</p>
      </div>`);
  }

  // ─── Sensory & Hidden Detail ───────────────────────────────────────────────
  const detailItems = [
    loc.sensoryDetail ? ['Sensory Detail', loc.sensoryDetail] : null,
    loc.hiddenDetail  ? ['Hidden Detail / Secret', loc.hiddenDetail] : null,
  ].filter(Boolean);

  if (detailItems.length) {
    parts.push(`<div class="npc-view-section" id="loc-section-details">
      <div class="npc-view-section-label">Details</div>
      <div class="npc-core-grid">${detailItems.map(([label, text]) =>
        `<div class="npc-core-item">
          <div class="npc-core-label">${esc(label)}</div>
          <p class="npc-view-prose">${WikiLinks.render(text)}</p>
        </div>`
      ).join('')}</div>
    </div>`);
  }

  // ─── Districts ─────────────────────────────────────────────────────────────
  const districts = (loc.districts || []).filter(d => d.name || d.readAloud || (d.pointsOfInterest || []).length);
  if (districts.length) {
    const districtCards = districts.map(d => {
      const pois = (d.pointsOfInterest || []).filter(p => p.name || p.description);
      return `
        <div class="npc-skill-card">
          <div class="npc-skill-label">${esc(d.name || 'Unnamed District')}</div>
          ${d.readAloud ? `<p class="npc-view-prose" style="font-style:italic;">${WikiLinks.render(d.readAloud)}</p>` : ''}
          ${pois.length ? `<ul class="npc-carry-list">${pois.map(p =>
            `<li><strong>${esc(p.name || 'Unnamed')}</strong>${p.description ? ` — ${WikiLinks.render(p.description)}` : ''}</li>`
          ).join('')}</ul>` : ''}
        </div>`;
    }).join('');
    parts.push(`<div class="npc-view-section" id="loc-section-districts">
      <div class="npc-view-section-label">Districts</div>
      <div class="npc-skills-view-grid">${districtCards}</div>
    </div>`);
  }

  // ─── On the Horizon ────────────────────────────────────────────────────────
  if (loc.onTheHorizon) {
    parts.push(`
      <div class="npc-view-section" id="loc-section-horizon">
        <div class="npc-view-section-label">On the Horizon</div>
        <p class="npc-view-prose">${WikiLinks.render(loc.onTheHorizon)}</p>
      </div>`);
  }

  return `<div class="npc-view-body">${parts.join('\n')}</div>`;
}

function buildToc() {
  const toc  = document.getElementById('toc-nav');
  if (!toc) return;
  const sections = [
    ['loc-section-identity',    'Identity'],
    ['loc-section-general',     'General'],
    ['loc-section-description', 'Description'],
    ['loc-section-details',     'Details'],
    ['loc-section-districts',   'Districts'],
    ['loc-section-horizon',     'On the Horizon'],
  ];
  const links = sections
    .filter(([id]) => document.getElementById(id))
    .map(([id, label]) => `<a href="#${id}" class="toc-link">${esc(label)}</a>`)
    .join('');
  if (links) toc.innerHTML = `<div class="toc-inner"><p class="toc-head">Contents</p>${links}</div>`;
}

function mountTagEditor(id, initialTags, apiBase) {
  const container = document.getElementById('loc-tags-container');
  if (!container) return;
  new TagInput(container, initialTags, {
    onUpdate: async (tags) => {
      await fetch(`${apiBase}/${id}/tags`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tags }),
      });
    },
  });
}

function setupConnectionsPanel(loc, linkedSessionDetails) {
  const btn = document.getElementById('btn-connections');
  if (!btn || !window.RecordConnectionsPanel) return;
  btn.addEventListener('click', () => {
    window.RecordConnectionsPanel.open({
      title: `${loc.name} Connections`,
      subtitle: 'All sessions currently linked to this location.',
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
      ],
    });
  });
}

async function deleteLocation(id) {
  const ok = await showConfirm('Move this Location to trash? You can restore it later from Settings.', {
    title: 'Move Location to Trash',
    confirmLabel: 'Move to Trash',
    danger: true,
  });
  if (!ok) return;
  try {
    const res = await fetch(`/api/locations/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error((await res.json()).error || 'Move to trash failed');
    showToast('Location moved to trash.', 'success');
    setTimeout(() => { location.href = '/locations'; }, 900);
  } catch (err) {
    showToast('Delete failed: ' + err.message, 'error');
  }
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
