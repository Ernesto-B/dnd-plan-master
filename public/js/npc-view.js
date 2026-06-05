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
  try {
    const res = await fetch(`/api/npcs/${id}`);
    if (!res.ok) throw new Error('Not found');
    npc = await res.json();
  } catch {
    content.innerHTML = '<div class="empty-state"><p>NPC not found.</p><a href="/npcs" class="btn btn-ghost">← Back to NPCs</a></div>';
    return;
  }

  document.title = `${npc.name} — D&D Session Master`;
  content.innerHTML = buildHTML(npc);

  // Build TOC
  buildToc();

  // Tags
  mountTagEditor(id, npc.tags || [], '/api/npcs');

  // Link buttons
  document.getElementById('btn-edit').addEventListener('click', () => {
    location.href = `/npc/edit/${id}`;
  });
  document.getElementById('btn-delete').addEventListener('click', () => deleteNpc(id));
})();

function buildHTML(npc) {
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

  // ─── Linked Plans ────────────────────────────────────────────────────────────
  const hasLinks = (npc.linkedSessions && npc.linkedSessions.length) ||
                   (npc.linkedEncounters && npc.linkedEncounters.length);
  if (hasLinks) {
    const sessionLinks = (npc.linkedSessions || []).map(id =>
      `<a href="/view/${esc(id)}" class="npc-link-chip">Session ${esc(id)}</a>`).join('');
    const encLinks = (npc.linkedEncounters || []).map(id =>
      `<a href="/encounter/view/${esc(id)}" class="npc-link-chip">Encounter ${esc(id)}</a>`).join('');
    parts.push(`<div class="npc-view-section" id="npc-section-links">
      <div class="npc-view-section-label">Linked Plans</div>
      <div class="npc-link-chips">${sessionLinks}${encLinks}</div>
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
    ['npc-section-links',      'Linked Plans'],
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
