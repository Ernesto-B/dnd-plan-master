let allLocations = [];

(async function () {
  const container = document.getElementById('locations-container');

  try {
    await refreshLocations();
  } catch {
    container.innerHTML = '<div class="empty-state"><p>Could not load Locations.</p></div>';
    return;
  }

  if (!allLocations.length) {
    container.innerHTML = `
      <div class="empty-state">
        <p>No Locations yet. Create your first place!</p>
        <a href="/location/new" class="btn btn-primary">+ New Location</a>
      </div>`;
    return;
  }

  renderTable(allLocations);
  initSearch({
    containerId: 'search-bar',
    getAllItems: () => allLocations,
    renderFn: renderTable,
    fields: [
      l => l.id,
      l => l.name,
      l => l.description,
      l => l.government,
      l => (l.tags || []).join(' '),
    ],
    dateField: l => l.createdAt,
  });
  initHoverPreview({
    containerId: 'locations-container',
    type: 'location',
    apiBase: '/api/locations',
  });
  initContextMenu({
    containerId: 'locations-container',
    type: 'location',
    apiBase: '/api/locations',
    allowArchive: true,
    getAllItems: () => allLocations,
    reloadItems: refreshLocations,
    renderItems: () => renderTable(allLocations),
    onDelete: (id) => { allLocations = allLocations.filter(l => l.id !== id); },
    onTagsUpdate: (id, tags) => {
      const l = allLocations.find(x => x.id === id);
      if (l) l.tags = tags;
      const row = document.querySelector(`#locations-container .session-row[data-id="${CSS.escape(id)}"]`);
      if (row) {
        const wrap = row.querySelector('.tags-wrap');
        if (wrap) wrap.innerHTML = tags && tags.length ? '<br>' + tagChipsHtml(tags) : '';
      }
    },
  });
})();

async function refreshLocations() {
  const res = await fetch('/api/locations');
  if (!res.ok) throw new Error('Could not load locations');
  allLocations = await res.json();
}

function renderTable(locations, isFiltered) {
  if (window.exitSelectMode) window.exitSelectMode();
  const container = document.getElementById('locations-container');

  if (!locations.length) {
    container.innerHTML = isFiltered
      ? `<div class="empty-state"><p>No Locations match your search.</p></div>`
      : `<div class="empty-state">
           <p>No Locations yet. Create your first place!</p>
           <a href="/location/new" class="btn btn-primary">+ New Location</a>
         </div>`;
    return;
  }

  const rows = locations.map(l => {
    const demoBadge = l.isDemo ? ' <span class="demo-badge">Demo</span>' : '';
    const linkChips = [];
    if (l.linkedSessions && l.linkedSessions.length)
      linkChips.push(`<span class="link-count-chip">${l.linkedSessions.length} session${l.linkedSessions.length === 1 ? '' : 's'}</span>`);
    const tagChips = tagChipsHtml(l.tags);
    return `
      <tr class="session-row" data-id="${l.id}">
        <td class="checkbox-cell"><input type="checkbox" class="row-checkbox"></td>
        <td class="clickable">
          <span class="session-num npc-name-cell">${escHtml(l.name)}</span>${demoBadge}
          ${linkChips.length ? ' ' + linkChips.join(' ') : ''}
          <span class="tags-wrap">${tagChips ? '<br>' + tagChips : ''}</span>
        </td>
        <td class="clickable session-goal">${escHtml(l.description || '')}</td>
        <td class="action-cell">
          <button class="btn-more-row" data-id="${l.id}" title="More options">⋮</button>
        </td>
      </tr>`;
  }).join('');

  container.innerHTML = `
    <table class="sessions-table">
      <thead>
        <tr>
          <th class="checkbox-cell"><input type="checkbox" class="row-checkbox select-all-checkbox" aria-label="Select all visible Locations"></th>
          <th>Name</th>
          <th>Description</th>
          <th style="width:44px"></th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;

  container.querySelectorAll('.clickable').forEach(td => {
    td.style.cursor = 'pointer';
    td.addEventListener('click', () => {
      if (window.isMultiSelectMode && window.isMultiSelectMode()) return;
      location.href = `/location/view/${td.closest('tr').dataset.id}`;
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
