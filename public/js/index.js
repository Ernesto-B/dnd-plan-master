let allSessions = [];
let lastVisibleSessionIds = [];

(async function () {
  const container = document.getElementById('sessions-container');

  try {
    const res = await fetch('/api/sessions');
    allSessions = await res.json();
  } catch {
    container.innerHTML = '<div class="empty-state"><p>Could not load sessions.</p></div>';
    return;
  }

  if (!allSessions.length) {
    container.innerHTML = `
      <div class="empty-state">
        <p>No sessions yet. Plan your first one!</p>
        <a href="/form" class="btn btn-primary">+ New Session</a>
      </div>`;
    return;
  }

  renderTable(allSessions);
  initSearch({
    containerId: 'search-bar',
    getAllItems: () => allSessions,
    renderFn: renderTable,
    fields: [
      s => s.id,
      s => String(s.sessionNumber),
      s => s.goal,
      s => (s.tags || []).join(' '),
    ],
    dateField: s => s.createdAt,
  });
  initHoverPreview({
    containerId: 'sessions-container',
    type: 'session',
    apiBase: '/api/sessions',
  });
  initContextMenu({
    containerId: 'sessions-container',
    type: 'session',
    apiBase: '/api/sessions',
    getAllItems: () => allSessions,
    onDelete: (id) => { allSessions = allSessions.filter(s => s.id !== id); },
    onTagsUpdate: (id, tags) => {
      const s = allSessions.find(x => x.id === id);
      if (s) s.tags = tags;
      const row = document.querySelector(`#sessions-container .session-row[data-id="${CSS.escape(id)}"]`);
      if (row) {
        const wrap = row.querySelector('.tags-wrap');
        if (wrap) wrap.innerHTML = tags && tags.length ? '<br>' + tagChipsHtml(tags) : '';
      }
    },
  });
})();

function renderTable(sessions, isFiltered) {
  if (window.exitSelectMode) window.exitSelectMode();
  const container = document.getElementById('sessions-container');
  lastVisibleSessionIds = sessions.map(session => session.id);

  if (!sessions.length) {
    container.innerHTML = isFiltered
      ? `<div class="empty-state"><p>No sessions match your search.</p></div>`
      : `<div class="empty-state">
           <p>No sessions yet. Plan your first one!</p>
           <a href="/form" class="btn btn-primary">+ New Session</a>
         </div>`;
    return;
  }

  const rows = sessions.map(s => {
    const numRaw = String(s.sessionNumber ?? '?');
    const num    = numRaw.includes('.') ? numRaw : numRaw.padStart(3, '0');
    const date   = s.date
      ? new Date(s.date + 'T12:00:00').toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
      : '—';
    const demoBadge = s.isDemo ? ' <span class="demo-badge">Demo</span>' : '';
    const linkedChip = s.linkedEncounterCount ? ` <span class="link-count-chip">${s.linkedEncounterCount} linked encounter${s.linkedEncounterCount === 1 ? '' : 's'}</span>` : '';
    const tagChips  = tagChipsHtml(s.tags);
    return `
      <tr class="session-row" data-id="${s.id}">
        <td class="drag-cell">
          <button class="row-drag-handle" type="button" draggable="true" title="Drag to reorder sessions" aria-label="Drag to reorder session">⋮⋮</button>
        </td>
        <td class="checkbox-cell"><input type="checkbox" class="row-checkbox"></td>
        <td class="clickable">
          <span class="session-num">#${num}</span>${demoBadge}${linkedChip}
          <span class="tags-wrap">${tagChips ? '<br>' + tagChips : ''}</span>
        </td>
        <td class="clickable session-date">${date}</td>
        <td class="clickable session-level">Lv ${s.partyLevel || '?'}</td>
        <td class="clickable session-goal">${escHtml(s.goal || '')}</td>
        <td class="action-cell">
          <button class="btn-more-row" data-id="${s.id}" title="More options">⋮</button>
        </td>
      </tr>`;
  }).join('');

  container.innerHTML = `
    <table class="sessions-table">
      <thead>
        <tr>
          <th class="drag-cell" aria-label="Reorder"></th>
          <th class="checkbox-cell"><input type="checkbox" class="row-checkbox select-all-checkbox" aria-label="Select all visible sessions"></th>
          <th>Session</th>
          <th>Date</th>
          <th>Party Level</th>
          <th>Goal</th>
          <th style="width:44px"></th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;

  container.querySelectorAll('.clickable').forEach(td => {
    td.style.cursor = 'pointer';
    td.addEventListener('click', () => {
      if (window.isMultiSelectMode && window.isMultiSelectMode()) return;
      location.href = `/view/${td.closest('tr').dataset.id}`;
    });
  });

  initRowReorder(container, '/api/sessions/reorder', isFiltered);

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

      const previousAllItems = allSessions.slice();
      const visibleIds = [...tbody.querySelectorAll('.session-row')].map(item => item.dataset.id);
      allSessions = mergeVisibleOrder(allSessions, visibleIds);

      try {
        const res = await fetch(apiUrl, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: allSessions.map(item => item.id) }),
        });
        if (!res.ok) throw new Error('Could not save session order');
      } catch (err) {
        allSessions = previousAllItems;
        const visibleSet = new Set(lastVisibleSessionIds);
        renderTable(isFiltered ? allSessions.filter(item => visibleSet.has(item.id)) : allSessions, isFiltered);
        showToast(err.message || 'Could not save session order.', 'error');
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
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
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
