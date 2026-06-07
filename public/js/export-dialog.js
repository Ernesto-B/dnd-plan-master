/**
 * Shared export dialog for sessions, encounters, NPCs, locations, and bundles.
 *
 * Usage:
 *   ExportDialog.open({
 *     title: 'Export Session',
 *     loadFiles: async () => [
 *       { filename: 'session-001', displayName: 'Session 001', type: 'session', markdown: '...', pdf: '<b64>' },
 *       { filename: 'encounter-abc', displayName: 'Bridge Ambush', type: 'encounter', markdown: '...', pdf: '<b64>' },
 *     ],
 *   });
 */
window.ExportDialog = (function () {
  let _overlay = null;

  const TYPE_LABEL = { session: 'Session', encounter: 'Encounter', npc: 'NPC', location: 'Location', bundle: 'Bundle' };
  const TYPE_CLASS = { session: 'expbadge-session', encounter: 'expbadge-encounter', npc: 'expbadge-npc', location: 'expbadge-location', bundle: 'expbadge-bundle' };
  const DEFAULT_FORMAT_OPTIONS = [
    { id: 'md', label: 'Markdown', ext: '.md', checked: true },
    { id: 'pdf', label: 'PDF', ext: '.pdf', checked: true },
  ];

  function esc(s) {
    const d = document.createElement('div');
    d.textContent = String(s ?? '');
    return d.innerHTML;
  }

  function ensureOverlay() {
    if (_overlay) return _overlay;
    _overlay = document.createElement('div');
    _overlay.className = 'export-dialog-overlay';
    _overlay.hidden = true;
    _overlay.innerHTML = `
      <div class="export-dialog-box" role="dialog" aria-modal="true" aria-labelledby="exp-dialog-title">
        <div class="export-dialog-head">
          <span class="export-dialog-title" id="exp-dialog-title">Export</span>
          <button class="export-dialog-x" id="exp-dialog-close" type="button" aria-label="Close">×</button>
        </div>
        <div class="export-dialog-body" id="exp-dialog-body">
          <div class="export-dialog-loading">
            <span class="spinner"></span>
            <span>Preparing files…</span>
          </div>
        </div>
        <div class="export-dialog-footer" id="exp-dialog-footer" hidden>
          <button class="btn btn-ghost" id="exp-dialog-cancel" type="button">Cancel</button>
          <button class="btn btn-primary" id="exp-dialog-confirm" type="button">Choose Save Folder →</button>
        </div>
      </div>`;
    document.body.appendChild(_overlay);

    _overlay.querySelector('#exp-dialog-close').addEventListener('click', close);
    _overlay.querySelector('#exp-dialog-cancel').addEventListener('click', close);
    _overlay.addEventListener('click', e => { if (e.target === _overlay) close(); });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && !_overlay.hidden) close();
    });
    return _overlay;
  }

  function close() {
    if (_overlay) _overlay.hidden = true;
  }

  function renderReady(files, formatOptions) {
    const count = files.length;
    const fileRows = files.map(f => {
      const label = TYPE_LABEL[f.type] || f.type || '';
      const cls   = TYPE_CLASS[f.type] || '';
      const displayName = f.displayName || f.label || f.filename;
      return `
        <div class="export-dialog-file-item">
          <span class="export-dialog-filename">${esc(displayName)}</span>
          ${label ? `<span class="export-dialog-badge ${esc(cls)}">${esc(label)}</span>` : ''}
        </div>`;
    }).join('');

    const formatRows = formatOptions.map(option => `
      <label class="export-dialog-format-row">
        <input type="checkbox" id="exp-fmt-${esc(option.id)}"${option.checked !== false ? ' checked' : ''}>
        <span>${esc(option.label)} <span class="export-dialog-ext">(${esc(option.ext)})</span></span>
      </label>
    `).join('');

    return `
      <div class="export-dialog-count">
        <span class="export-dialog-count-num">${count}</span>
        file${count !== 1 ? 's' : ''} ready to export
      </div>
      <div class="export-dialog-file-list">${fileRows}</div>
      <div class="export-dialog-formats">
        <div class="export-dialog-formats-label">Format</div>
        ${formatRows}
      </div>`;
  }

  async function open({ title, loadFiles, formatOptions, saveEndpoint }) {
    const ov       = ensureOverlay();
    const body     = ov.querySelector('#exp-dialog-body');
    const footer   = ov.querySelector('#exp-dialog-footer');
    const titleEl  = ov.querySelector('#exp-dialog-title');
    const activeFormatOptions = (Array.isArray(formatOptions) && formatOptions.length ? formatOptions : DEFAULT_FORMAT_OPTIONS)
      .map(option => ({ ...option }));

    // Reset state
    titleEl.textContent = title || 'Export';
    body.innerHTML = `
      <div class="export-dialog-loading">
        <span class="spinner"></span>
        <span>Preparing files…</span>
      </div>`;
    footer.hidden = true;
    ov.hidden = false;

    let files;
    try {
      files = await loadFiles();
    } catch (err) {
      body.innerHTML = `<div class="export-dialog-error">Failed to prepare files: ${esc(err.message)}</div>`;
      footer.hidden = false;
      const confirmBtn = footer.querySelector('#exp-dialog-confirm');
      if (confirmBtn) confirmBtn.hidden = true;
      return;
    }

    if (!files || !files.length) {
      body.innerHTML = `<div class="export-dialog-error">No files to export.</div>`;
      footer.hidden = false;
      const confirmBtn = footer.querySelector('#exp-dialog-confirm');
      if (confirmBtn) confirmBtn.hidden = true;
      return;
    }

    body.innerHTML = renderReady(files, activeFormatOptions);
    footer.hidden = false;

    // Replace confirm button to clear old listeners
    const oldConfirm = footer.querySelector('#exp-dialog-confirm');
    const confirmBtn = oldConfirm.cloneNode(true);
    confirmBtn.hidden = false;
    oldConfirm.replaceWith(confirmBtn);

    function validateFormats() {
      const selectedCount = activeFormatOptions.reduce((count, option) => (
        count + (ov.querySelector(`#exp-fmt-${option.id}`)?.checked ? 1 : 0)
      ), 0);
      confirmBtn.disabled = selectedCount === 0;
    }
    activeFormatOptions.forEach(option => {
      ov.querySelector(`#exp-fmt-${option.id}`)?.addEventListener('change', validateFormats);
    });
    validateFormats();

    confirmBtn.addEventListener('click', async () => {
      const formats = activeFormatOptions.reduce((acc, option) => {
        acc[option.id] = !!ov.querySelector(`#exp-fmt-${option.id}`)?.checked;
        return acc;
      }, {});
      if (!Object.values(formats).some(Boolean)) return;

      confirmBtn.disabled = true;
      confirmBtn.innerHTML = '<span class="spinner"></span> Saving…';

      try {
        const res = await fetch(saveEndpoint || '/api/export/save-files', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ files, formats }),
        });
        const result = await res.json();
        if (!res.ok) throw new Error(result.error || 'Save failed');

        if (result.cancelled) {
          showToast('No folder selected — nothing was saved.', 'success');
        } else {
          const n = result.count || result.savedFiles?.length || files.length;
          const selectedLabels = activeFormatOptions
            .filter(option => formats[option.id])
            .map(option => option.label.toUpperCase());
          const fmtDesc = selectedLabels.join(' + ');
          showToast(`Saved ${n} ${fmtDesc} file${n !== 1 ? 's' : ''} → ${result.path}`, 'success');
        }
        close();
      } catch (err) {
        showToast('Export failed: ' + err.message, 'error');
        confirmBtn.disabled = false;
        confirmBtn.textContent = 'Choose Save Folder →';
      }
    });
  }

  return { open, close };
})();
