let allFactions = [];
let lastVisibleFactionIds = [];

(async function () {
  const container = document.getElementById('factions-container');

  try {
    await refreshFactions();
  } catch {
    container.innerHTML = '<div class="empty-state"><p>Could not load factions.</p></div>';
    return;
  }

  if (!allFactions.length) {
    container.innerHTML = `
      <div class="empty-state">
        <p>No factions yet. Create your first power group!</p>
        <a href="/faction/new" class="btn btn-primary">+ New Faction</a>
      </div>`;
    return;
  }

  renderTable(allFactions);
  initSearch({
    containerId: 'search-bar',
    getAllItems: () => allFactions,
    renderFn: renderTable,
    fields: [
      faction => faction.id,
      faction => faction.name,
      faction => faction.origin,
      faction => faction.goal,
      faction => (faction.tags || []).join(' '),
    ],
    dateField: faction => faction.createdAt,
  });
  initHoverPreview({
    containerId: 'factions-container',
    type: 'faction',
    apiBase: '/api/factions',
  });
  initContextMenu({
    containerId: 'factions-container',
    type: 'faction',
    apiBase: '/api/factions',
    allowArchive: true,
    getAllItems: () => allFactions,
    reloadItems: refreshFactions,
    renderItems: () => renderTable(allFactions),
    duplicate: {
      createUrl: '/api/factions',
      label: 'Faction',
      buildPayload: faction => {
        const data = { ...faction };
        delete data.id;
        delete data.createdAt;
        delete data.campaignId;
        delete data.sortOrder;
        delete data.archivedAt;
        delete data.trashedAt;
        delete data.restorableStatus;
        return {
          ...data,
          name: duplicateLabel(data.name || faction.name, 'Copy'),
        };
      },
    },
    onDelete: id => { allFactions = allFactions.filter(faction => faction.id !== id); },
    onTagsUpdate: (id, tags) => {
      const faction = allFactions.find(item => item.id === id);
      if (faction) faction.tags = tags;
      const row = document.querySelector(`#factions-container .session-row[data-id="${CSS.escape(id)}"]`);
      if (row) {
        const wrap = row.querySelector('.tags-wrap');
        if (wrap) wrap.innerHTML = tags && tags.length ? '<br>' + tagChipsHtml(tags) : '';
      }
    },
  });
})();

async function refreshFactions() {
  const res = await fetch('/api/factions');
  if (!res.ok) throw new Error('Could not load factions');
  allFactions = await res.json();
}

function renderTable(factions, isFiltered) {
  if (window.exitSelectMode) window.exitSelectMode();
  const container = document.getElementById('factions-container');
  lastVisibleFactionIds = factions.map(faction => faction.id);

  if (!factions.length) {
    container.innerHTML = isFiltered
      ? `<div class="empty-state"><p>No factions match your search.</p></div>`
      : `<div class="empty-state">
           <p>No factions yet. Create your first power group!</p>
           <a href="/faction/new" class="btn btn-primary">+ New Faction</a>
         </div>`;
    return;
  }

  const rows = factions.map(faction => {
    const demoBadge = faction.isDemo ? ' <span class="demo-badge">Demo</span>' : '';
    const linkChips = [];
    if (faction.linkedSessions?.length) linkChips.push(linkCountChip(faction.linkedSessions.length, 'session'));
    if (faction.linkedEncounters?.length) linkChips.push(linkCountChip(faction.linkedEncounters.length, 'encounter'));
    if (faction.linkedNpcs?.length) linkChips.push(linkCountChip(faction.linkedNpcs.length, 'NPC'));
    if (faction.linkedLocations?.length) linkChips.push(linkCountChip(faction.linkedLocations.length, 'location'));
    const tagChips = tagChipsHtml(faction.tags);
    const reputationText = reputationLabel(faction.partyReputation);
    return `
      <tr class="session-row" data-id="${faction.id}">
        <td class="drag-cell">
          <button class="row-drag-handle" type="button" draggable="true" title="Drag to reorder factions" aria-label="Drag to reorder faction">⋮⋮</button>
        </td>
        <td class="checkbox-cell"><input type="checkbox" class="row-checkbox"></td>
        <td class="clickable">
          <span class="session-num npc-name-cell">${escHtml(faction.name)}</span>${demoBadge}
          ${faction.origin ? `<span class="npc-nickname"> · ${escHtml(faction.origin)}</span>` : ''}
          ${linkChips.length ? ' ' + linkChips.join(' ') : ''}
          <span class="tags-wrap">${tagChips ? '<br>' + tagChips : ''}</span>
        </td>
        <td class="clickable session-goal">${escHtml(faction.goal || '')}</td>
        <td class="clickable">${escHtml(reputationText)}</td>
        <td class="action-cell">
          <button class="btn-more-row" data-id="${faction.id}" title="More options">⋮</button>
        </td>
      </tr>`;
  }).join('');

  container.innerHTML = `
    <table class="sessions-table">
      <thead>
        <tr>
          <th class="drag-cell" aria-label="Reorder"></th>
          <th class="checkbox-cell"><input type="checkbox" class="row-checkbox select-all-checkbox" aria-label="Select all visible factions"></th>
          <th>Name</th>
          <th>Goal</th>
          <th>Reputation</th>
          <th style="width:44px"></th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;

  container.querySelectorAll('.clickable').forEach(td => {
    td.style.cursor = 'pointer';
    td.addEventListener('click', () => {
      if (window.isMultiSelectMode && window.isMultiSelectMode()) return;
      location.href = `/faction/view/${td.closest('tr').dataset.id}`;
    });
  });

  initRowReorder(container, '/api/factions/reorder', isFiltered);
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

      const previousAllItems = allFactions.slice();
      const visibleIds = [...tbody.querySelectorAll('.session-row')].map(item => item.dataset.id);
      allFactions = mergeVisibleOrder(allFactions, visibleIds);

      try {
        const res = await fetch(apiUrl, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: allFactions.map(item => item.id) }),
        });
        if (!res.ok) throw new Error('Could not save faction order');
      } catch (err) {
        allFactions = previousAllItems;
        const visibleSet = new Set(lastVisibleFactionIds);
        renderTable(isFiltered ? allFactions.filter(item => visibleSet.has(item.id)) : allFactions, isFiltered);
        showToast(err.message || 'Could not save faction order.', 'error');
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

function linkCountChip(count, label) {
  return `<span class="link-count-chip">${count} ${label}${count === 1 ? '' : 's'}</span>`;
}

function reputationLabel(value) {
  const score = Number(value) || 0;
  const labels = {
    '-3': 'Hostile',
    '-2': 'Distrusted',
    '-1': 'Cold',
    '0': 'Neutral',
    '1': 'Warm',
    '2': 'Trusted',
    '3': 'Allied',
  };
  return `${score > 0 ? '+' : ''}${score} ${labels[String(score)] || ''}`.trim();
}

function escHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

function tagChipsHtml(tags, max = 3) {
  if (!tags || !tags.length) return '';
  const visible = tags.slice(0, max).map(tag => `<span class="tag-chip${String(tag || '').trim().toLowerCase() === 'draft' ? ' is-draft' : ''}">${escHtml(tag)}</span>`);
  if (tags.length > max) visible.push(`<span class="tag-chip overflow">+${tags.length - max}</span>`);
  return visible.join(' ');
}

function duplicateLabel(value, suffix) {
  const base = String(value || '').trim();
  return base ? `${base} (${suffix})` : suffix;
}

function showToast(msg, type = 'success') {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.className = `toast ${type} show`;
  setTimeout(() => { t.className = 'toast'; }, 5000);
}
