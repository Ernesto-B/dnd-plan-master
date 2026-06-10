let allEncounters = [];
let lastVisibleEncounterIds = [];

(async function () {
  const container = document.getElementById('encounters-container');

  try {
    await refreshEncounters();
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
    allowArchive: true,
    getAllItems: () => allEncounters,
    reloadItems: refreshEncounters,
    renderItems: () => renderTable(allEncounters),
    duplicate: {
      createUrl: '/api/encounters',
      label: 'encounter',
      buildPayload: encounter => {
        const data = { ...(encounter.data || encounter) };
        delete data.id;
        delete data.createdAt;
        delete data.campaignId;
        return {
          ...data,
          name: duplicateLabel(data.name || encounter.name, 'Copy'),
        };
      },
    },
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

async function refreshEncounters() {
  const res = await fetch('/api/encounters');
  if (!res.ok) throw new Error('Could not load encounter plans');
  allEncounters = await res.json();
}

function renderTable(encounters, isFiltered) {
  if (window.exitSelectMode) window.exitSelectMode();
  const container = document.getElementById('encounters-container');
  lastVisibleEncounterIds = encounters.map(encounter => encounter.id);

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
        <td class="drag-cell">
          <button class="row-drag-handle" type="button" draggable="true" title="Drag to reorder encounters" aria-label="Drag to reorder encounter">⋮⋮</button>
        </td>
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
          <th class="drag-cell" aria-label="Reorder"></th>
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

  initRowReorder(container, '/api/encounters/reorder', isFiltered);

}

function initRowReorder(container, apiUrl, isFiltered) {
  const tbody = container.querySelector('tbody');
  if (!tbody) return;

  let draggedId = null;

  function clearDragState() {
    tbody.querySelectorAll('.session-row').forEach(row => {
      row.classList.remove('drag-over-before', 'drag-over-after', 'is-dragging');
      row.removeAttribute('draggable');
    });
  }

  tbody.querySelectorAll('.session-row').forEach(row => {
    const handle = row.querySelector('.row-drag-handle');
    if (!handle) return;

    handle.addEventListener('dragstart', event => {
      if (window.isMultiSelectMode && window.isMultiSelectMode()) {
        event.preventDefault();
        return;
      }
      draggedId = row.dataset.id;
      row.setAttribute('draggable', 'true');
      row.classList.add('is-dragging');
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', draggedId);
    });

    handle.addEventListener('dragend', () => {
      draggedId = null;
      clearDragState();
    });

    row.addEventListener('dragover', event => {
      if (!draggedId || draggedId === row.dataset.id) return;
      if (window.isMultiSelectMode && window.isMultiSelectMode()) return;
      event.preventDefault();
      const rect = row.getBoundingClientRect();
      const before = event.clientY < rect.top + rect.height / 2;
      row.classList.toggle('drag-over-before', before);
      row.classList.toggle('drag-over-after', !before);
    });

    row.addEventListener('dragleave', () => {
      row.classList.remove('drag-over-before', 'drag-over-after');
    });

    row.addEventListener('drop', async event => {
      if (!draggedId || draggedId === row.dataset.id) return;
      if (window.isMultiSelectMode && window.isMultiSelectMode()) return;
      event.preventDefault();

      const sourceRow = tbody.querySelector(`.session-row[data-id="${CSS.escape(draggedId)}"]`);
      if (!sourceRow) return;

      const rect = row.getBoundingClientRect();
      const before = event.clientY < rect.top + rect.height / 2;
      if (before) tbody.insertBefore(sourceRow, row);
      else tbody.insertBefore(sourceRow, row.nextSibling);

      clearDragState();

      const previousAllItems = allEncounters.slice();
      const visibleIds = [...tbody.querySelectorAll('.session-row')].map(item => item.dataset.id);
      allEncounters = mergeVisibleOrder(allEncounters, visibleIds);

      try {
        const res = await fetch(apiUrl, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: allEncounters.map(item => item.id) }),
        });
        if (!res.ok) throw new Error('Could not save encounter order');
      } catch (err) {
        allEncounters = previousAllItems;
        const visibleSet = new Set(lastVisibleEncounterIds);
        renderTable(isFiltered ? allEncounters.filter(item => visibleSet.has(item.id)) : allEncounters, isFiltered);
        showToast(err.message || 'Could not save encounter order.', 'error');
        return;
      }
    });
  });
}

function mergeVisibleOrder(allItems, visibleIds) {
  const visibleSet = new Set(visibleIds);
  const byId = new Map(allItems.map(item => [item.id, item]));
  const orderedVisible = visibleIds.map(id => byId.get(id)).filter(Boolean);
  let index = 0;
  return allItems.map(item => (visibleSet.has(item.id) ? orderedVisible[index++] : item));
}

function escHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

function tagChipsHtml(tags, max = 3) {
  if (!tags || !tags.length) return '';
  const visible = tags.slice(0, max).map(t => `<span class="tag-chip${String(t || '').trim().toLowerCase() === 'draft' ? ' is-draft' : ''}">${escHtml(t)}</span>`);
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

function duplicateLabel(value, suffix) {
  const base = String(value || '').trim();
  return base ? `${base} (${suffix})` : suffix;
}
