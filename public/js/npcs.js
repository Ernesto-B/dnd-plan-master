let allNpcs = [];

(async function () {
  const container = document.getElementById('npcs-container');

  try {
    const res = await fetch('/api/npcs');
    allNpcs = await res.json();
  } catch {
    container.innerHTML = '<div class="empty-state"><p>Could not load NPCs.</p></div>';
    return;
  }

  if (!allNpcs.length) {
    container.innerHTML = `
      <div class="empty-state">
        <p>No NPCs yet. Create your first character!</p>
        <a href="/npc/new" class="btn btn-primary">+ New NPC</a>
      </div>`;
    return;
  }

  renderTable(allNpcs);
  initSearch({
    containerId: 'search-bar',
    getAllItems: () => allNpcs,
    renderFn: renderTable,
    fields: [
      n => n.id,
      n => n.name,
      n => n.nickname,
      n => n.situation,
      n => (n.tags || []).join(' '),
    ],
    dateField: n => n.createdAt,
  });
  initHoverPreview({
    containerId: 'npcs-container',
    type: 'npc',
    apiBase: '/api/npcs',
  });
  initContextMenu({
    containerId: 'npcs-container',
    type: 'npc',
    apiBase: '/api/npcs',
    getAllItems: () => allNpcs,
    onDelete: (id) => { allNpcs = allNpcs.filter(n => n.id !== id); },
    onTagsUpdate: (id, tags) => {
      const n = allNpcs.find(x => x.id === id);
      if (n) n.tags = tags;
      const row = document.querySelector(`#npcs-container .session-row[data-id="${CSS.escape(id)}"]`);
      if (row) {
        const wrap = row.querySelector('.tags-wrap');
        if (wrap) wrap.innerHTML = tags && tags.length ? '<br>' + tagChipsHtml(tags) : '';
      }
    },
  });
})();

function renderTable(npcs, isFiltered) {
  if (window.exitSelectMode) window.exitSelectMode();
  const container = document.getElementById('npcs-container');

  if (!npcs.length) {
    container.innerHTML = isFiltered
      ? `<div class="empty-state"><p>No NPCs match your search.</p></div>`
      : `<div class="empty-state">
           <p>No NPCs yet. Create your first character!</p>
           <a href="/npc/new" class="btn btn-primary">+ New NPC</a>
         </div>`;
    return;
  }

  const rows = npcs.map(n => {
    const demoBadge = n.isDemo ? ' <span class="demo-badge">Demo</span>' : '';
    const linkChips = [];
    if (n.linkedSessions && n.linkedSessions.length)
      linkChips.push(`<span class="link-count-chip">${n.linkedSessions.length} session${n.linkedSessions.length === 1 ? '' : 's'}</span>`);
    if (n.linkedEncounters && n.linkedEncounters.length)
      linkChips.push(`<span class="link-count-chip">${n.linkedEncounters.length} encounter${n.linkedEncounters.length === 1 ? '' : 's'}</span>`);
    const tagChips = tagChipsHtml(n.tags);
    return `
      <tr class="session-row" data-id="${n.id}">
        <td class="checkbox-cell"><input type="checkbox" class="row-checkbox"></td>
        <td class="clickable">
          <span class="session-num npc-name-cell">${escHtml(n.name)}</span>${demoBadge}
          ${n.nickname ? `<span class="npc-nickname"> "${escHtml(n.nickname)}"</span>` : ''}
          ${linkChips.length ? ' ' + linkChips.join(' ') : ''}
          <span class="tags-wrap">${tagChips ? '<br>' + tagChips : ''}</span>
        </td>
        <td class="clickable session-goal">${escHtml(n.situation || '')}</td>
        <td class="action-cell">
          <button class="btn-more-row" data-id="${n.id}" title="More options">⋮</button>
        </td>
      </tr>`;
  }).join('');

  container.innerHTML = `
    <table class="sessions-table">
      <thead>
        <tr>
          <th class="checkbox-cell"><input type="checkbox" class="row-checkbox select-all-checkbox" aria-label="Select all visible NPCs"></th>
          <th>Name</th>
          <th>Situation</th>
          <th style="width:44px"></th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;

  container.querySelectorAll('.clickable').forEach(td => {
    td.style.cursor = 'pointer';
    td.addEventListener('click', () => {
      if (window.isMultiSelectMode && window.isMultiSelectMode()) return;
      location.href = `/npc/view/${td.closest('tr').dataset.id}`;
    });
  });
}

function escHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

function tagChipsHtml(tags, max = 3) {
  if (!tags || !tags.length) return '';
  const visible = tags.slice(0, max).map(t => `<span class="tag-chip">${escHtml(t)}</span>`);
  if (tags.length > max) visible.push(`<span class="tag-chip overflow">+${tags.length - max}</span>`);
  return visible.join(' ');
}

function showToast(msg, type = 'success') {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.className = `toast ${type} show`;
  setTimeout(() => { t.className = 'toast'; }, 5000);
}
