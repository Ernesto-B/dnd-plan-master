// Module-level opener — ExportDialogPortal.jsx registers itself here on mount.
let _open = null;

export function _register(openFn) { _open = openFn; }

export function openExport(opts) {
  if (_open) { _open(opts); return; }
  console.warn('ExportDialog not mounted');
}
