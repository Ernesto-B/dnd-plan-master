(async function () {
  const container = document.getElementById('sessions-container');

  let sessions;
  try {
    const res = await fetch('/api/sessions');
    sessions = await res.json();
  } catch {
    container.innerHTML = '<div class="empty-state"><p>Could not load sessions.</p></div>';
    return;
  }

  if (!sessions.length) {
    container.innerHTML = `
      <div class="empty-state">
        <p>No sessions yet. Plan your first one!</p>
        <a href="/form" class="btn btn-primary">+ New Session</a>
      </div>`;
    return;
  }

  renderTable(sessions);
})();

function renderTable(sessions) {
  const container = document.getElementById('sessions-container');
  const rows = sessions.map(s => {
    const num  = String(s.sessionNumber).padStart(3, '0');
    const date = s.date
      ? new Date(s.date + 'T12:00:00').toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
      : '—';
    const demoBadge = s.isDemo ? ' <span class="demo-badge">Demo</span>' : '';
    return `
      <tr class="session-row" data-id="${s.id}">
        <td class="clickable"><span class="session-num">#${num}</span>${demoBadge}</td>
        <td class="clickable session-date">${date}</td>
        <td class="clickable session-level">Lv ${s.partyLevel || '?'}</td>
        <td class="clickable session-goal">${escHtml(s.goal || '')}</td>
        <td class="action-cell">
          <button class="btn-delete-row" data-id="${s.id}" data-num="${num}" title="Delete session">✕</button>
        </td>
      </tr>`;
  }).join('');

  container.innerHTML = `
    <table class="sessions-table">
      <thead>
        <tr>
          <th>Session</th>
          <th>Date</th>
          <th>Party Level</th>
          <th>Goal</th>
          <th style="width:44px"></th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;

  // Row click → navigate
  container.querySelectorAll('.clickable').forEach(td => {
    td.style.cursor = 'pointer';
    td.addEventListener('click', () => {
      location.href = `/view/${td.closest('tr').dataset.id}`;
    });
  });

  // Delete buttons
  container.querySelectorAll('.btn-delete-row').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const { id, num } = btn.dataset;
      const ok = await showConfirm(`Delete Session ${num}? This cannot be undone.`, {
        title: 'Delete Session',
        confirmLabel: 'Delete',
        danger: true,
      });
      if (!ok) return;

      try {
        const res = await fetch(`/api/sessions/${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error((await res.json()).error || 'Delete failed');
        btn.closest('tr').remove();
        // Show empty state if no rows left
        if (!document.querySelector('.session-row')) {
          document.getElementById('sessions-container').innerHTML = `
            <div class="empty-state">
              <p>No sessions yet. Plan your first one!</p>
              <a href="/form" class="btn btn-primary">+ New Session</a>
            </div>`;
        }
      } catch (err) {
        showToast('Delete failed: ' + err.message, 'error');
      }
    });
  });
}

function escHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function showToast(msg, type = 'success') {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.className = `toast ${type} show`;
  setTimeout(() => { t.className = 'toast'; }, 5000);
}
