(function () {
  function ensurePanel() {
    let overlay = document.getElementById('connections-panel-overlay');
    if (overlay) return overlay;

    overlay = document.createElement('div');
    overlay.id = 'connections-panel-overlay';
    overlay.className = 'connections-panel-overlay hidden';
    overlay.innerHTML = `
      <div class="connections-panel-shell" role="dialog" aria-modal="true" aria-labelledby="connections-panel-title">
        <div class="connections-panel-head">
          <div>
            <div class="connections-panel-kicker">Connections</div>
            <h2 id="connections-panel-title" class="connections-panel-title">Record Connections</h2>
            <p id="connections-panel-subtitle" class="connections-panel-subtitle"></p>
          </div>
          <button type="button" class="connections-panel-close" id="btn-close-connections-panel" aria-label="Close">×</button>
        </div>
        <div id="connections-panel-body" class="connections-panel-body"></div>
      </div>`;

    overlay.addEventListener('click', event => {
      if (event.target === overlay) closePanel();
    });
    document.body.appendChild(overlay);
    overlay.querySelector('#btn-close-connections-panel').addEventListener('click', closePanel);
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !overlay.classList.contains('hidden')) closePanel();
    });
    return overlay;
  }

  function escHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function renderSection(section) {
    const items = Array.isArray(section.items) ? section.items : [];
    return `
      <section class="connections-panel-section">
        <div class="connections-panel-section-head">
          <span>${escHtml(section.title || 'Connections')}</span>
          <span class="connections-panel-count">${items.length}</span>
        </div>
        ${items.length
          ? `<div class="connections-panel-list">${items.map(item => `
              <a class="connections-panel-item${item.exists === false ? ' is-missing' : ''}" href="${item.exists === false ? '#' : escHtml(item.url || '#')}"${item.exists === false ? ' aria-disabled="true"' : ''}>
                <span class="connections-panel-item-title">${escHtml(item.label || item.id || 'Untitled')}</span>
                ${item.meta ? `<span class="connections-panel-item-meta">${escHtml(item.meta)}</span>` : ''}
              </a>
            `).join('')}</div>`
          : `<p class="connections-panel-empty">${escHtml(section.empty || `No ${section.title?.toLowerCase() || 'connections'} yet.`)}</p>`}
      </section>`;
  }

  function openPanel(config) {
    const overlay = ensurePanel();
    const titleEl = document.getElementById('connections-panel-title');
    const subtitleEl = document.getElementById('connections-panel-subtitle');
    const bodyEl = document.getElementById('connections-panel-body');
    if (!titleEl || !subtitleEl || !bodyEl) return;

    titleEl.textContent = config.title || 'Record Connections';
    subtitleEl.textContent = config.subtitle || 'All linked records for this page.';
    bodyEl.innerHTML = (config.sections || []).map(renderSection).join('') || '<p class="connections-panel-empty">No connections yet.</p>';

    overlay.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    overlay.querySelector('#btn-close-connections-panel')?.focus();
  }

  function closePanel() {
    const overlay = document.getElementById('connections-panel-overlay');
    if (!overlay) return;
    overlay.classList.add('hidden');
    document.body.style.overflow = '';
  }

  window.RecordConnectionsPanel = {
    open: openPanel,
    close: closePanel,
  };
})();
