let allNpcs = [];
let lastVisibleNpcIds = [];

(async function () {
  const container = document.getElementById('npcs-container');

  try {
    await refreshNpcs();
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
    allowArchive: true,
    getAllItems: () => allNpcs,
    reloadItems: refreshNpcs,
    renderItems: () => renderTable(allNpcs),
    duplicate: {
      createUrl: '/api/npcs',
      label: 'NPC',
      buildPayload: npc => {
        const data = { ...npc };
        delete data.id;
        delete data.createdAt;
        delete data.campaignId;
        delete data.sortOrder;
        return {
          ...data,
          name: duplicateLabel(data.name || npc.name, 'Copy'),
        };
      },
    },
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

async function refreshNpcs() {
  const res = await fetch('/api/npcs');
  if (!res.ok) throw new Error('Could not load NPCs');
  allNpcs = await res.json();
}

function renderTable(npcs, isFiltered) {
  if (window.exitSelectMode) window.exitSelectMode();
  const container = document.getElementById('npcs-container');
  lastVisibleNpcIds = npcs.map(npc => npc.id);

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
        <td class="drag-cell">
          <button class="row-drag-handle" type="button" draggable="true" title="Drag to reorder NPCs" aria-label="Drag to reorder NPC">⋮⋮</button>
        </td>
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
          <th class="drag-cell" aria-label="Reorder"></th>
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

  initRowReorder(container, '/api/npcs/reorder', isFiltered);
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

      const previousAllItems = allNpcs.slice();
      const visibleIds = [...tbody.querySelectorAll('.session-row')].map(item => item.dataset.id);
      allNpcs = mergeVisibleOrder(allNpcs, visibleIds);

      try {
        const res = await fetch(apiUrl, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: allNpcs.map(item => item.id) }),
        });
        if (!res.ok) throw new Error('Could not save NPC order');
      } catch (err) {
        allNpcs = previousAllItems;
        const visibleSet = new Set(lastVisibleNpcIds);
        renderTable(isFiltered ? allNpcs.filter(item => visibleSet.has(item.id)) : allNpcs, isFiltered);
        showToast(err.message || 'Could not save NPC order.', 'error');
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

function duplicateLabel(value, suffix) {
  const base = String(value || '').trim();
  return base ? `${base} (${suffix})` : suffix;
}
