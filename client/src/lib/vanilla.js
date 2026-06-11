// Backwards-compat re-exports — all bridges now live in dedicated ES modules.
// Callers can continue importing from here; new code should import directly.
export { toast, toastAction }           from './toast.js';
export { confirmDialog, promptDialog }  from './dialog.js';
export { openExport }                   from './exportDialog.js';
export { openConnections }              from './connectionsPanel.js';
export { render as wikiRender, preload as wikiPreload } from './wikiLinks.js';

// mountTags: view pages use <TagEditor> directly now; kept as no-op stub so
// pages that haven't been updated yet don't throw at import time.
export function mountTags() {}
