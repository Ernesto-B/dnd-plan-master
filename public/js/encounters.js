let allEncounters = [];

(async function () {
  const container = document.getElementById('encounters-container');

  try {
    const res = await fetch('/api/encounters');
    allEncounters = await res.json();
  } catch {
    container.innerHTML = '<div class="empty-state"><p>Could not load encounter plans.</p></div>';
    return;
  }

  if (!allEncounters.length) {
    container.innerHTML = `
      <div class="empty-state">
        <p>No encounter plans yet. Create your first one!</p>
        <a href="/encounter/new" class="btn btn-primary">+ New Encounter Plan</a>
      </div>`;
    return;
  }

  renderTable(allEncounters);
  initSearch({
    containerId: 'search-bar',
    getAllItems: () => allEncounters,
    renderFn: renderTable,
    fields: [
      e => e.id,
      e => e.name,
      e => e.fiction,
      e => e.sessionId,
      e => (e.tags || []).join(' '),
    ],
    dateField: e => e.createdAt,
  });
  initHoverPreview({
    containerId: 'encounters-container',
    type: 'encounter',
    apiBase: '/api/encounters',
  });
  initContextMenu({
    containerId: 'encounters-container',
    type: 'encounter',
    apiBase: '/api/encounters',
    getAllItems: () => allEncounters,
    onDelete: (id) => { allEncounters = allEncounters.filter(e => e.id !== id); },
    onTagsUpdate: (id, tags) => {
      const enc = allEncounters.find(x => x.id === id);
      if (enc) enc.tags = tags;
      const row = document.querySelector(`#encounters-container .session-row[data-id="${CSS.escape(id)}"]`);
      if (row) {
        const wrap = row.querySelector('.tags-wrap');
        if (wrap) wrap.innerHTML = tags && tags.length ? '<br>' + tagChipsHtml(tags) : '';
      }
    },
  });
})();

function renderTable(encounters, isFiltered) {
  if (window.exitSelectMode) window.exitSelectMode();
  const container = document.getElementById('encounters-container');

  if (!encounters.length) {
    container.innerHTML = isFiltered
      ? `<div class="empty-state"><p>No encounter plans match your search.</p></div>`
      : `<div class="empty-state">
           <p>No encounter plans yet. Create your first one!</p>
           <a href="/encounter/new" class="btn btn-primary">+ New Encounter Plan</a>
         </div>`;
    return;
  }

  const rows = encounters.map(e => {
    const demoBadge = e.isDemo ? ' <span class="demo-badge">Demo</span>' : '';
    const linkedChip = e.linkedSessionCount ? ` <span class="link-count-chip">${e.linkedSessionCount} linked session${e.linkedSessionCount === 1 ? '' : 's'}</span>` : '';
    const tagChips  = tagChipsHtml(e.tags);
    const session   = e.sessionId ? `<span class="session-num">${escHtml(e.sessionId)}</span>` : '<span style="color:var(--muted)">—</span>';
    const date      = e.createdAt
      ? new Date(e.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
      : '—';
    return `
      <tr class="session-row" data-id="${e.id}">
        <td class="checkbox-cell"><input type="checkbox" class="row-checkbox"></td>
        <td class="clickable">
          <span class="session-num">${escHtml(e.id)}</span>${demoBadge}${linkedChip}
          <span class="tags-wrap">${tagChips ? '<br>' + tagChips : ''}</span>
        </td>
        <td class="clickable session-goal">${escHtml(e.name || '')}</td>
        <td class="clickable session-date">${session}</td>
        <td class="clickable session-date">${date}</td>
        <td class="clickable session-goal">${escHtml(e.fiction || '')}</td>
        <td class="action-cell">
          <button class="btn-more-row" data-id="${e.id}" title="More options">⋮</button>
        </td>
      </tr>`;
  }).join('');

  container.innerHTML = `
    <table class="sessions-table">
      <thead>
        <tr>
          <th class="checkbox-cell"><input type="checkbox" class="row-checkbox select-all-checkbox" aria-label="Select all visible encounters"></th>
          <th>ID</th>
          <th>Encounter Name</th>
          <th>Session</th>
          <th>Created</th>
          <th>Fiction</th>
          <th style="width:44px"></th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;

  container.querySelectorAll('.clickable').forEach(td => {
    td.style.cursor = 'pointer';
    td.addEventListener('click', () => {
      if (window.isMultiSelectMode && window.isMultiSelectMode()) return;
      location.href = `/encounter/view/${td.closest('tr').dataset.id}`;
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
