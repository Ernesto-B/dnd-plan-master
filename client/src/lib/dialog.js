// Module-level resolver — AppDialogs.jsx registers itself here on mount.
let _open = null;

export function _register(openFn) { _open = openFn; }

export function confirmDialog(msg, opts = {}) {
  if (_open) return _open('confirm', msg, opts);
  return Promise.resolve(window.confirm(msg));
}

export function promptDialog(msg, opts = {}) {
  if (_open) return _open('prompt', msg, opts);
  return Promise.resolve(window.prompt(msg, opts.defaultValue || ''));
}
