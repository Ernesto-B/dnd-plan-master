// Module-level opener — ConnectionsPanelPortal.jsx registers itself here on mount.
let _open = null;

export function _register(openFn) { _open = openFn; }

export function openConnections(config) {
  if (_open) { _open(config); return; }
  console.warn('ConnectionsPanel not mounted');
}
