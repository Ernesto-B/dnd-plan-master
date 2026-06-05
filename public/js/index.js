let allSessions = [];

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
