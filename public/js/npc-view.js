const SKILL_LABELS = {
  perception:    'Perception',
  insight:       'Insight',
  medicine:      'Medicine',
  investigation: 'Investigation',
  arcana:        'Arcana',
  history:       'History',
  religion:      'Religion',
  nature:        'Nature',
  persuasion:    'Persuasion',
  deception:     'Deception',
  intimidation:  'Intimidation',
};

const SKILL_PREFIXES = {
  perception:    'For the Perceptive',
  insight:       'For the Insightful',
  medicine:      'For the Healer',
  investigation: 'For the Investigator',
  arcana:        'For the Arcanist',
  history:       'For the Historian',
  religion:      'For the Faithful',
  nature:        'For the Naturalist',
  persuasion:    'Under Persuasion',
  deception:     'Detecting Deception',
  intimidation:  'Under Intimidation',
};

(async function () {
  const id      = location.pathname.split('/').pop();
  const content = document.getElementById('npc-content');

  let npc;
  let linkedEncounterDetails = [];
  try {
    const res = await fetch(`/api/npcs/${id}`);
    if (!res.ok) throw new Error('Not found');
    npc = await res.json();
  } catch {
    content.innerHTML = '<div class="empty-state"><p>NPC not found.</p><a href="/npcs" class="btn btn-ghost">← Back to NPCs</a></div>';
    return;
  }

  document.title = `${npc.name} — D&D Session Master`;

  // Fetch linked session details in parallel with rendering
  let linkedSessionDetails = [];
  if ((npc.linkedSessions && npc.linkedSessions.length) || (npc.linkedEncounters && npc.linkedEncounters.length)) {
    try {
      const [sessionRes, encounterRes] = await Promise.all([
        fetch(`/api/npcs/${id}/linked-sessions`),
        fetch(`/api/npcs/${id}/linked-encounters`),
      ]);
      if (sessionRes.ok) linkedSessionDetails = await sessionRes.json();
      if (encounterRes.ok) linkedEncounterDetails = await encounterRes.json();
    } catch {}
  }

  content.innerHTML = buildHTML(npc, linkedSessionDetails);

  // Build TOC
  buildToc();

  // Tags
  mountTagEditor(id, npc.tags || [], '/api/npcs', '#tags-anchor');
  setupConnectionsPanel(npc, linkedSessionDetails, linkedEncounterDetails);

  // Link buttons
  document.getElementById('btn-edit').addEventListener('click', () => {
    location.href = `/npc/edit/${id}`;
  });
  document.getElementById('btn-delete').addEventListener('click', () => deleteNpc(id));

  document.getElementById('btn-export').addEventListener('click', () => {
    ExportDialog.open({
      title: 'Export NPC',
      loadFiles: async () => {
        const res = await fetch('/api/npcs/export', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(npc),
        });
        const result = await res.json();
        if (!res.ok) throw new Error(result.error || 'Generation failed');
        return [{
          filename: result.filename,
          displayName: npc.name || result.filename,
          type: 'npc',
          markdown: result.markdown,
          pdf: result.pdf,
        }];
      },
    });
  });

  document.getElementById('btn-export-connections').addEventListener('click', () => {
    ExportDialog.open({
      title: 'Export NPC with Connections',
      loadFiles: async () => {
        const files = [];

        const npcRes = await fetch('/api/npcs/export', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(npc),
        });
        const npcResult = await npcRes.json();
        if (!npcRes.ok) throw new Error(npcResult.error || 'Generation failed');
        files.push({
          filename: npcResult.filename,
          displayName: npc.name || npcResult.filename,
          type: 'npc',
          markdown: npcResult.markdown,
          pdf: npcResult.pdf,
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

        const encounterJobs = (linkedEncounterDetails || [])
          .filter(e => e.exists !== false)
          .map(async enc => {
            const encRes = await fetch(`/api/encounters/${encodeURIComponent(enc.id)}`);
            if (!encRes.ok) return null;
            const encData = await encRes.json();
            const genRes = await fetch('/api/encounters/preview', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(encData.data),
            });
            const genResult = await genRes.json();
            if (!genRes.ok) return null;
            return {
              filename: genResult.filename,
              displayName: enc.name || enc.id,
              type: 'encounter',
              markdown: genResult.markdown,
              pdf: genResult.pdf,
            };
          });

        const [sessResults, encResults] = await Promise.all([
          Promise.allSettled(sessionJobs),
          Promise.allSettled(encounterJobs),
        ]);

        sessResults.forEach(r => { if (r.status === 'fulfilled' && r.value) files.push(r.value); });
        encResults.forEach(r => { if (r.status === 'fulfilled' && r.value) files.push(r.value); });

        return files;
      },
    });
  });
})();

function buildHTML(npc, linkedSessionDetails = []) {
  const parts = [];

  // ─── Header ────────────────────────────────────────────────────────────────
  parts.push(`
    <div class="npc-view-header" id="npc-section-identity">
      <h1 class="npc-view-name">${esc(npc.name)}${npc.nickname ? `<span class="npc-view-nickname">"${esc(npc.nickname)}"</span>` : ''}</h1>
      <div id="npc-tags-container" class="npc-view-tags"></div>
    </div>`);

  // ─── Common Phrase ─────────────────────────────────────────────────────────
  if (npc.commonPhrase) {
    parts.push(`
      <blockquote class="npc-phrase" id="npc-section-phrase">
        ${esc(npc.commonPhrase)}
      </blockquote>`);
  }

  // ─── Appearance ────────────────────────────────────────────────────────────
  if (npc.appearance) {
    parts.push(`
      <div class="npc-view-section" id="npc-section-appearance">
        <div class="npc-view-section-label">Appearance</div>
        <p class="npc-view-prose npc-view-appearance">${esc(npc.appearance)}</p>
      </div>`);
  }

  // ─── Character Core ─────────────────────────────────────────────────────────
  const coreItems = [
    npc.situation    ? ['Situation',     npc.situation]    : null,
    npc.wantsNeeds   ? ['Wants & Needs', npc.wantsNeeds]   : null,
    npc.secretObstacle ? ['Secret / Obstacle', npc.secretObstacle] : null,
  ].filter(Boolean);

  if (coreItems.length) {
    parts.push(`<div class="npc-view-section" id="npc-section-core">
      <div class="npc-view-section-label">Character Core</div>
      <div class="npc-core-grid">${coreItems.map(([label, text]) =>
        `<div class="npc-core-item">
          <div class="npc-core-label">${esc(label)}</div>
          <p class="npc-view-prose">${esc(text)}</p>
        </div>`
      ).join('')}</div>
    </div>`);
  }

  // ─── Skill Triggers ─────────────────────────────────────────────────────────
  const skills = npc.skillDescriptions || {};
  const filledSkills = Object.entries(SKILL_LABELS).filter(([k]) => skills[k] && skills[k].trim());
  if (filledSkills.length) {
    const skillCards = filledSkills.map(([k, label]) => `
      <div class="npc-skill-card">
        <div class="npc-skill-label">${esc(SKILL_PREFIXES[k])} <span class="npc-skill-sub">(${esc(label)})</span></div>
        <p class="npc-view-prose">${esc(skills[k])}</p>
      </div>`).join('');
    parts.push(`<div class="npc-view-section" id="npc-section-skills">
      <div class="npc-view-section-label">Skill Triggers <span class="npc-dm-only">— DM only</span></div>
      <div class="npc-skills-view-grid">${skillCards}</div>
    </div>`);
  }

  // ─── Carrying ───────────────────────────────────────────────────────────────
  if (npc.carrying && npc.carrying.length) {
    const items = npc.carrying.map(i => `<li>${esc(i)}</li>`).join('');
    parts.push(`<div class="npc-view-section" id="npc-section-carrying">
      <div class="npc-view-section-label">Carrying</div>
      <ul class="npc-carry-list">${items}</ul>
    </div>`);
  }

  return `<div class="npc-view-body">${parts.join('\n')}</div>`;
}

function buildToc() {
  const toc  = document.getElementById('toc-nav');
  if (!toc) return;
  const sections = [
    ['npc-section-identity',   'Identity'],
    ['npc-section-phrase',     'Signature'],
    ['npc-section-appearance', 'Appearance'],
    ['npc-section-core',       'Core'],
    ['npc-section-skills',     'Skill Triggers'],
    ['npc-section-carrying',   'Carrying'],
  ];
  const links = sections
    .filter(([id]) => document.getElementById(id))
    .map(([id, label]) => `<a href="#${id}" class="toc-link">${esc(label)}</a>`)
    .join('');
  if (links) toc.innerHTML = `<div class="toc-inner"><p class="toc-head">Contents</p>${links}</div>`;
}

function mountTagEditor(id, initialTags, apiBase) {
  const container = document.getElementById('npc-tags-container');
  if (!container) return;
  const ti = new TagInput(container, initialTags, {
    onUpdate: async (tags) => {
      await fetch(`${apiBase}/${id}/tags`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tags }),
      });
    },
  });
}

function setupConnectionsPanel(npc, linkedSessionDetails, linkedEncounterDetails) {
  const btn = document.getElementById('btn-connections');
  if (!btn || !window.RecordConnectionsPanel) return;
  btn.addEventListener('click', () => {
    window.RecordConnectionsPanel.open({
      title: `${npc.name} Connections`,
      subtitle: 'All sessions and encounter plans currently linked to this NPC.',
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
      ],
    });
  });
}


async function deleteNpc(id) {
  const ok = await showConfirm('Delete this NPC? This cannot be undone.', {
    title: 'Delete NPC',
    confirmLabel: 'Delete',
    danger: true,
  });
  if (!ok) return;
  try {
    const res = await fetch(`/api/npcs/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error((await res.json()).error || 'Delete failed');
    showToast('NPC deleted.', 'success');
    setTimeout(() => { location.href = '/npcs'; }, 900);
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
