(async function () {
  // ─── Theme toggle ─────────────────────────────────────────────────────────────
  const themeBtn = document.getElementById('btn-theme-toggle');
  function applyTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    localStorage.setItem('dnd-theme', t);
    themeBtn.textContent = t === 'dark' ? '☀ Switch to Light' : '☽ Switch to Dark';
  }
  applyTheme(localStorage.getItem('dnd-theme') || 'dark');
  themeBtn.addEventListener('click', () => {
    applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
  });

  const list = document.getElementById('party-list');
  let count = 0;

  function makePlayerRow(data = {}) {
    count++;
    const row = document.createElement('div');
    row.className = 'form-grid party-row';
    row.style.cssText = 'grid-template-columns: 1fr 1fr auto; gap: 10px; margin-bottom: 8px;';
    row.innerHTML = `
      <div class="field">
        <label>Player Name</label>
        <input type="text" class="player-name" placeholder="Aldric" value="${h(data.name || '')}">
      </div>
      <div class="field">
        <label>Class / Role</label>
        <input type="text" class="player-class" placeholder="Paladin" value="${h(data.playerClass || '')}">
      </div>
      <div class="field" style="align-self:flex-end; padding-bottom:2px;">
        <button type="button" class="btn btn-ghost remove-btn" style="color:var(--danger);">✕</button>
      </div>`;
    row.querySelector('.remove-btn').addEventListener('click', () => row.remove());
    return row;
  }

  function h(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  // Load existing settings
  try {
    const res = await fetch('/api/settings');
    const settings = await res.json();
    (settings.party || []).forEach(p => list.appendChild(makePlayerRow(p)));
  } catch {
    // start empty
  }

  document.getElementById('btn-add-player').addEventListener('click', () => {
    list.appendChild(makePlayerRow());
  });

  document.getElementById('btn-save').addEventListener('click', async () => {
    const party = [...list.querySelectorAll('.party-row')].map(row => ({
      name: row.querySelector('.player-name').value.trim(),
      playerClass: row.querySelector('.player-class').value.trim(),
    })).filter(p => p.name || p.playerClass);

    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ party }),
      });
      if (!res.ok) throw new Error('Save failed');
      showToast('Settings saved.', 'success');
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    }
  });

  document.getElementById('btn-clear-data').addEventListener('click', async () => {
    const ok = await showConfirm(
      'Delete all saved session and encounter plans? Exported files on your filesystem are unaffected. The demo plans will reappear on next visit.',
      { title: 'Clear All Data', confirmLabel: 'Clear All', danger: true }
    );
    if (!ok) return;
    try {
      const res = await fetch('/api/settings/data', { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.json()).error || 'Clear failed');
      showToast('All data cleared. Demo plans will reappear on next page load.', 'success');
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    }
  });

  function showToast(msg, type = 'success') {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.className = `toast ${type} show`;
    setTimeout(() => { t.className = 'toast'; }, 4000);
  }
})();
