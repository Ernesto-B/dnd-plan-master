(function () {
  const STORAGE_KEY = 'dnd-shortcuts';

  const DEFINITIONS = [
    { action: 'newSession', label: 'New Session Plan', description: 'Open the session form.', defaultCombo: 'Alt+Shift+S' },
    { action: 'newEncounter', label: 'New Encounter Plan', description: 'Open the encounter form.', defaultCombo: 'Alt+Shift+E' },
    { action: 'newNpc', label: 'New NPC', description: 'Open the NPC form.', defaultCombo: 'Alt+Shift+N' },
    { action: 'goSessions', label: 'Go to Sessions', description: 'Jump to the sessions list.', defaultCombo: 'Alt+1' },
    { action: 'goEncounters', label: 'Go to Encounters', description: 'Jump to the encounter list.', defaultCombo: 'Alt+2' },
    { action: 'goNpcs', label: 'Go to NPCs', description: 'Jump to the NPC list.', defaultCombo: 'Alt+3' },
    { action: 'goCampaign', label: 'Go to Campaign', description: 'Jump to the campaign view.', defaultCombo: 'Alt+4' },
    { action: 'goSettings', label: 'Go to Settings', description: 'Jump to the settings page.', defaultCombo: 'Alt+5' },
    { action: 'focusSearch', label: 'Focus Search', description: 'Place the cursor in the active page search field.', defaultCombo: '/' },
    { action: 'savePrimary', label: 'Save / Primary Action', description: 'Trigger the page’s main save or submit button.', defaultCombo: 'Mod+S' },
  ];

  const KEY_ALIASES = {
    ' ': 'Space',
    Spacebar: 'Space',
    Esc: 'Escape',
    Del: 'Delete',
    Left: 'ArrowLeft',
    Right: 'ArrowRight',
    Up: 'ArrowUp',
    Down: 'ArrowDown',
  };

  function getDefinitions() {
    return DEFINITIONS.map(item => ({ ...item }));
  }

  function getDefaultShortcuts() {
    return DEFINITIONS.reduce((acc, item) => {
      acc[item.action] = item.defaultCombo;
      return acc;
    }, {});
  }

  function normalizeKey(key) {
    if (!key) return '';
    const alias = KEY_ALIASES[key] || key;
    if (alias.length === 1) return alias.toUpperCase();
    return alias;
  }

  function isModifierKey(key) {
    return ['Shift', 'Control', 'Alt', 'Meta'].includes(key);
  }

  function canonicalizeShortcutString(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const parts = raw.split('+').map(part => part.trim()).filter(Boolean);
    let key = '';
    const mods = new Set();

    parts.forEach(part => {
      const upper = part.toUpperCase();
      if (upper === 'CTRL' || upper === 'CONTROL' || upper === 'CMD' || upper === 'COMMAND' || upper === 'META' || upper === 'MOD') {
        mods.add('Mod');
      } else if (upper === 'ALT' || upper === 'OPTION') {
        mods.add('Alt');
      } else if (upper === 'SHIFT') {
        mods.add('Shift');
      } else {
        key = normalizeKey(part);
      }
    });

    if (!key) return '';
    const ordered = [];
    if (mods.has('Mod')) ordered.push('Mod');
    if (mods.has('Alt')) ordered.push('Alt');
    if (mods.has('Shift')) ordered.push('Shift');
    ordered.push(key);
    return ordered.join('+');
  }

  function eventToCombo(event) {
    const key = normalizeKey(event.key);
    if (!key || isModifierKey(key)) return '';

    const parts = [];
    if (event.ctrlKey || event.metaKey) parts.push('Mod');
    if (event.altKey) parts.push('Alt');
    if (event.shiftKey) parts.push('Shift');
    parts.push(key);
    return canonicalizeShortcutString(parts.join('+'));
  }

  function loadStoredShortcuts() {
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
    } catch {
      return defaults;
    }
  }

  function saveStoredShortcuts(shortcuts) {
    const defaults = getDefaultShortcuts();
    const normalized = { ...defaults };
    Object.keys(defaults).forEach(action => {
      normalized[action] = canonicalizeShortcutString(shortcuts[action] || defaults[action]) || defaults[action];
    });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    return normalized;
  }

  function isEditableTarget(target) {
    if (!target) return false;
    if (target.isContentEditable) return true;
    const tag = target.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
  }

  function getSearchTarget() {
    return document.querySelector('#search-query, .search-input, #campaign-search');
  }

  function getPrimaryActionButton() {
    return document.querySelector('#btn-save:not([disabled]), #btn-submit:not([disabled])');
  }

  function handleShortcutAction(action) {
    const routes = {
      newSession: '/form',
      newEncounter: '/encounter/new',
      newNpc: '/npc/new',
      goSessions: '/',
      goEncounters: '/encounters',
      goNpcs: '/npcs',
      goCampaign: '/campaign',
      goSettings: '/settings',
    };

    if (routes[action]) {
      if (window.location.pathname !== routes[action]) window.location.href = routes[action];
      return true;
    }

    if (action === 'focusSearch') {
      const search = getSearchTarget();
      if (!search) return false;
      search.focus();
      if (typeof search.select === 'function') search.select();
      return true;
    }

    if (action === 'savePrimary') {
      const btn = getPrimaryActionButton();
      if (!btn) return false;
      btn.click();
      return true;
    }

    return false;
  }

  function installRuntime() {
    let shortcuts = loadStoredShortcuts();

    window.addEventListener('storage', event => {
      if (event.key === STORAGE_KEY) {
        shortcuts = loadStoredShortcuts();
      }
    });

    window.addEventListener('dnd-shortcuts-updated', () => {
      shortcuts = loadStoredShortcuts();
    });

    fetch('/api/settings')
      .then(res => res.ok ? res.json() : null)
      .then(settings => {
        if (settings && settings.shortcuts) {
          shortcuts = saveStoredShortcuts(settings.shortcuts);
        }
      })
      .catch(() => {});

    document.addEventListener('keydown', event => {
      if (event.defaultPrevented || event.repeat) return;
      if (document.querySelector('#shortcut-modal-overlay:not(.hidden)')) return;

      const combo = eventToCombo(event);
      if (!combo) return;

      const action = Object.entries(shortcuts).find(([, shortcut]) => canonicalizeShortcutString(shortcut) === combo)?.[0];
      if (!action) return;

      if (isEditableTarget(event.target) && action !== 'savePrimary') return;

      const handled = handleShortcutAction(action);
      if (!handled) return;

      event.preventDefault();
      event.stopPropagation();
    }, true);
  }

  window.Shortcuts = {
    getDefinitions,
    getDefaultShortcuts,
    canonicalizeShortcutString,
    eventToCombo,
    loadStoredShortcuts,
    saveStoredShortcuts,
  };

  installRuntime();
})();
