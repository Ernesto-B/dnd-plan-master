// Thin accessors for the shared vanilla helpers loaded as classic scripts in
// index.html (see public/js/*). Reused during the React migration; these get
// replaced by real React components in a later phase.
export const wikiRender = raw => (window.WikiLinks ? window.WikiLinks.render(raw || '') : String(raw ?? ''));
export const wikiPreload = () => (window.WikiLinks ? window.WikiLinks.preload() : Promise.resolve());
export const toast = (msg, type = 'success') => window.showToast && window.showToast(msg, type);
export const toastAction = (msg, type, actionLabel, onAction) => {
  const t = document.getElementById('toast'); if (!t) return;
  t.innerHTML = '';
  const s = document.createElement('span'); s.textContent = msg; t.appendChild(s);
  const b = document.createElement('button'); b.type = 'button'; b.className = 'toast-action'; b.textContent = actionLabel;
  b.addEventListener('click', async () => { t.className = 'toast'; await onAction(); }); t.appendChild(b);
  t.className = `toast toast-has-action ${type} show`;
  setTimeout(() => { t.className = 'toast'; }, 6000);
};
export const confirmDialog = (msg, opts) =>
  window.showConfirm ? window.showConfirm(msg, opts) : Promise.resolve(window.confirm(msg));
export const promptDialog = (msg, opts = {}) =>
  window.showPrompt ? window.showPrompt(msg, opts) : Promise.resolve(window.prompt(msg, opts.defaultValue || ''));
export const mountTags = (id, tags, apiBase, anchorSelector) =>
  window.mountTagEditor && window.mountTagEditor(id, tags, apiBase, anchorSelector);
export const openExport = opts => window.ExportDialog && window.ExportDialog.open(opts);
export const openConnections = opts => window.RecordConnectionsPanel && window.RecordConnectionsPanel.open(opts);
