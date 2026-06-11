// ES-module port of public/js/shortcuts.js
// The DOM help-modal is NOT included — the React GlobalShortcutsPanel replaces it.
// Navigation uses a registered React Router navigate function for SPA compatibility.

const STORAGE_KEY = 'dnd-shortcuts';

export const DEFINITIONS = [
  { action: 'newSession',    label: 'New Session Plan',   description: 'Open the session form.',                defaultCombo: 'Alt+Shift+S' },
  { action: 'newEncounter',  label: 'New Encounter Plan', description: 'Open the encounter form.',             defaultCombo: 'Alt+Shift+E' },
  { action: 'newNpc',        label: 'New NPC',            description: 'Open the NPC form.',                   defaultCombo: 'Alt+Shift+N' },
  { action: 'newFaction',    label: 'New Faction',        description: 'Open the faction form.',               defaultCombo: 'Alt+Shift+F' },
  { action: 'historyBack',   label: 'Go Back',            description: 'Return to the previous page.',         defaultCombo: 'Mod+[' },
  { action: 'historyForward',label: 'Go Forward',         description: 'Go forward in history.',               defaultCombo: 'Mod+]' },
  { action: 'goSessions',    label: 'Go to Sessions',     description: 'Jump to the sessions list.',           defaultCombo: 'Alt+1' },
  { action: 'goEncounters',  label: 'Go to Encounters',   description: 'Jump to the encounter list.',          defaultCombo: 'Alt+2' },
  { action: 'goNpcs',        label: 'Go to NPCs',         description: 'Jump to the NPC list.',                defaultCombo: 'Alt+3' },
  { action: 'goCampaign',    label: 'Go to Campaign',     description: 'Jump to the campaign view.',           defaultCombo: 'Alt+4' },
  { action: 'goSettings',    label: 'Go to Settings',     description: 'Jump to the settings page.',           defaultCombo: 'Alt+5' },
  { action: 'goFactions',    label: 'Go to Factions',     description: 'Jump to the factions list.',           defaultCombo: 'Alt+6' },
  { action: 'focusSearch',   label: 'Focus Search',       description: 'Place cursor in the page search field.', defaultCombo: '/' },
  { action: 'savePrimary',   label: 'Save / Primary Action', description: 'Trigger the main save button.',     defaultCombo: 'Mod+S' },
];

const KEY_ALIASES = {
  ' ': 'Space', Spacebar: 'Space', Esc: 'Escape', Del: 'Delete',
  Left: 'ArrowLeft', Right: 'ArrowRight', Up: 'ArrowUp', Down: 'ArrowDown',
};

export function getDefinitions() { return DEFINITIONS.map(d => ({ ...d })); }

export function getDefaultShortcuts() {
  return DEFINITIONS.reduce((acc, d) => { acc[d.action] = d.defaultCombo; return acc; }, {});
}

function normalizeKey(key) {
  if (!key) return '';
  const alias = KEY_ALIASES[key] || key;
  return alias.length === 1 ? alias.toUpperCase() : alias;
}

function isModifierKey(key) { return ['Shift','Control','Alt','Meta'].includes(key); }

export function canonicalizeShortcutString(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const parts = raw.split('+').map(p => p.trim()).filter(Boolean);
  let key = '';
  const mods = new Set();
  parts.forEach(part => {
    const u = part.toUpperCase();
    if (['CTRL','CONTROL','CMD','COMMAND','META','MOD'].includes(u)) mods.add('Mod');
    else if (['ALT','OPTION'].includes(u)) mods.add('Alt');
    else if (u === 'SHIFT') mods.add('Shift');
    else key = normalizeKey(part);
  });
  if (!key) return '';
  const ordered = [];
  if (mods.has('Mod'))   ordered.push('Mod');
  if (mods.has('Alt'))   ordered.push('Alt');
  if (mods.has('Shift')) ordered.push('Shift');
  ordered.push(key);
  return ordered.join('+');
}

export function eventToCombo(event) {
  const key = normalizeKey(event.key);
  if (!key || isModifierKey(key)) return '';
  const parts = [];
  if (event.ctrlKey || event.metaKey) parts.push('Mod');
  if (event.altKey)  parts.push('Alt');
  if (event.shiftKey) parts.push('Shift');
  parts.push(key);
  return canonicalizeShortcutString(parts.join('+'));
}

export function loadStoredShortcuts() {
  const defaults = getDefaultShortcuts();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw);
    const merged = { ...defaults };
    Object.keys(defaults).forEach(action => {
      merged[action] = canonicalizeShortcutString(parsed[action] || defaults[action]) || defaults[action];
    });
    return merged;
  } catch { return defaults; }
}

export function saveStoredShortcuts(shortcuts) {
  const defaults = getDefaultShortcuts();
  const normalized = { ...defaults };
  Object.keys(defaults).forEach(action => {
    normalized[action] = canonicalizeShortcutString(shortcuts[action] || defaults[action]) || defaults[action];
  });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
}

// ── Runtime ─────────────────────────────────────────────────────────────────
// Registered by ShortcutsRuntime.jsx so navigation uses React Router.
let _navigate = null;
export function _registerNavigate(fn) { _navigate = fn; }

const ROUTES = {
  newSession: '/form', newEncounter: '/encounter/new', newNpc: '/npc/new', newFaction: '/faction/new',
  goSessions: '/sessions', goEncounters: '/encounters', goNpcs: '/npcs',
  goCampaign: '/campaign', goSettings: '/settings', goFactions: '/factions',
};

function isEditableTarget(target) {
  if (!target) return false;
  if (target.isContentEditable) return true;
  return ['INPUT','TEXTAREA','SELECT'].includes(target.tagName);
}

function getSearchTarget() {
  return document.querySelector('#search-query, .search-input, #campaign-search');
}

function getPrimaryActionButton() {
  return document.querySelector('#btn-save:not([disabled]), #btn-submit:not([disabled])');
}

function handleAction(action) {
  if (action === 'historyBack')    { window.history.back(); return true; }
  if (action === 'historyForward') { window.history.forward(); return true; }
  if (ROUTES[action]) {
    if (_navigate) _navigate(ROUTES[action]);
    else window.location.href = ROUTES[action];
    return true;
  }
  if (action === 'focusSearch') {
    const el = getSearchTarget();
    if (!el) return false;
    el.focus(); el.select?.();
    return true;
  }
  if (action === 'savePrimary') {
    const btn = getPrimaryActionButton();
    if (!btn) return false;
    btn.click(); return true;
  }
  return false;
}

export function installRuntime() {
  let shortcuts = loadStoredShortcuts();

  const syncShortcuts = () => { shortcuts = loadStoredShortcuts(); };
  window.addEventListener('storage', e => { if (e.key === STORAGE_KEY) syncShortcuts(); });
  window.addEventListener('dnd-shortcuts-updated', syncShortcuts);

  fetch('/api/settings')
    .then(r => r.ok ? r.json() : null)
    .then(s => { if (s?.shortcuts) shortcuts = saveStoredShortcuts(s.shortcuts); })
    .catch(() => {});

  document.addEventListener('keydown', event => {
    if (event.defaultPrevented || event.repeat) return;
    const combo = eventToCombo(event);
    if (!combo) return;
    const action = Object.entries(shortcuts).find(([, sc]) => canonicalizeShortcutString(sc) === combo)?.[0];
    if (!action) return;
    if (isEditableTarget(event.target) && action !== 'savePrimary') return;
    if (!handleAction(action)) return;
    event.preventDefault();
    event.stopPropagation();
  }, true);
}
