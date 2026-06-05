(async function () {
  const container = document.getElementById('encounters-container');

  let encounters;
  try {
    const res = await fetch('/api/encounters');
    encounters = await res.json();
  } catch {
    container.innerHTML = '<div class="empty-state"><p>Could not load encounter plans.</p></div>';
    return;
  }

  if (!encounters.length) {
    container.innerHTML = `
      <div class="empty-state">
        <p>No encounter plans yet. Create your first one!</p>
        <a href="/encounter/new" class="btn btn-primary">+ New Encounter Plan</a>
      </div>`;
    return;
  }

  renderTable(encounters);
})();

function renderTable(encounters) {
  const container = document.getElementById('encounters-container');
  const rows = encounters.map(e => {
    const demoBadge = e.isDemo ? ' <span class="demo-badge">Demo</span>' : '';
    const session = e.sessionId ? `<span class="session-num">${e.sessionId}</span>` : '<span style="color:var(--muted)">—</span>';
    return `
      <tr class="session-row" data-id="${e.id}">
        <td class="clickable"><span class="session-num">${escHtml(e.id)}</span>${demoBadge}</td>
        <td class="clickable session-goal">${escHtml(e.name || '')}</td>
        <td class="clickable session-date">${session}</td>
        <td class="clickable" style="font-family:var(--font-body);font-size:14px;font-style:italic;color:var(--muted);max-width:340px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escHtml(e.fiction || '')}</td>
        <td class="action-cell">
          <button class="btn-delete-row" data-id="${e.id}" title="Delete">✕</button>
        </td>
      </tr>`;
  }).join('');

  container.innerHTML = `
    <table class="sessions-table">
      <thead>
        <tr>
          <th>ID</th>
          <th>Encounter Name</th>
          <th>Session</th>
          <th>Fiction</th>
          <th style="width:44px"></th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;

  container.querySelectorAll('.clickable').forEach(td => {
    td.style.cursor = 'pointer';
    td.addEventListener('click', () => {
      location.href = `/encounter/view/${td.closest('tr').dataset.id}`;
    });
  });

  container.querySelectorAll('.btn-delete-row').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const { id } = btn.dataset;
      const ok = await showConfirm(`Delete Encounter Plan ${id}? This cannot be undone.`, {
        title: 'Delete Encounter Plan',
        confirmLabel: 'Delete',
        danger: true,
      });
      if (!ok) return;
      try {
        const res = await fetch(`/api/encounters/${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error((await res.json()).error || 'Delete failed');
        btn.closest('tr').remove();
        if (!document.querySelector('.session-row')) {
          document.getElementById('encounters-container').innerHTML = `
            <div class="empty-state">
              <p>No encounter plans yet.</p>
              <a href="/encounter/new" class="btn btn-primary">+ New Encounter Plan</a>
            </div>`;
        }
      } catch (err) {
        showToast('Delete failed: ' + err.message, 'error');
      }
    });
  });
}

function escHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

function showToast(msg, type = 'success') {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.className = `toast ${type} show`;
  setTimeout(() => { t.className = 'toast'; }, 5000);
}
