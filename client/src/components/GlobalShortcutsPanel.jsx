import React, { useEffect } from 'react';

const CATEGORIES = [
  {
    label: 'Create',
    entries: [
      { action: 'newSession', label: 'New Session Plan' },
      { action: 'newEncounter', label: 'New Encounter Plan' },
      { action: 'newNpc', label: 'New NPC' },
      { action: 'newFaction', label: 'New Faction' },
    ],
  },
  {
    label: 'Go To',
    entries: [
      { action: 'goSessions', label: 'Sessions' },
      { action: 'goEncounters', label: 'Encounters' },
      { action: 'goNpcs', label: 'NPCs' },
      { action: 'goCampaign', label: 'Campaign' },
      { action: 'goFactions', label: 'Factions' },
      { action: 'goSettings', label: 'Settings' },
    ],
  },
  {
    label: 'Interface',
    entries: [
      { action: 'historyBack', label: 'Go Back' },
      { action: 'historyForward', label: 'Go Forward' },
      { action: 'focusSearch', label: 'Focus Search' },
      { action: 'savePrimary', label: 'Save / Primary Action' },
    ],
  },
];

function fmtCombo(combo) {
  if (!combo) return '—';
  const mac = /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent || '');
  return combo
    .replace(/\bMod\b/g, mac ? '⌘' : 'Ctrl')
    .replace(/\bAlt\b/g, mac ? '⌥' : 'Alt')
    .replace(/\bShift\b/g, '⇧');
}

export default function GlobalShortcutsPanel({ onClose }) {
  const SC = window.Shortcuts;
  const shortcuts = SC ? SC.loadStoredShortcuts() : {};

  useEffect(() => {
    const onKey = e => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  return (
    <div className="gsc-overlay" onClick={onClose}>
      <div className="gwc-shortcuts-panel gsc-panel" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Keyboard shortcuts">
        <div className="gwc-shortcuts-header">
          <span className="gwc-shortcuts-title">Keyboard Shortcuts</span>
          <button type="button" className="gwc-shortcuts-close" onClick={onClose}>✕</button>
        </div>
        {CATEGORIES.map((cat, ci) => (
          <React.Fragment key={cat.label}>
            {ci > 0 && <div className="gwc-shortcuts-divider" />}
            <div className="gwc-shortcuts-section-label">{cat.label}</div>
            <div className="gwc-shortcuts-grid">
              {cat.entries.map(({ action, label }) => (
                <React.Fragment key={action}>
                  <span className="gwc-shortcuts-action">{label}</span>
                  <kbd className="gwc-shortcuts-key">{fmtCombo(shortcuts[action] || '—')}</kbd>
                </React.Fragment>
              ))}
            </div>
          </React.Fragment>
        ))}
        <div className="gwc-shortcuts-divider" />
        <div className="gsc-footer">
          <span>
            Press <kbd className="gwc-shortcuts-key gsc-key-sm">⌘ /</kbd> or <kbd className="gwc-shortcuts-key gsc-key-sm">?</kbd> to toggle
          </span>
          <a href="/settings#settings-appearance" className="gsc-settings-link" onClick={onClose}>Edit shortcuts ›</a>
        </div>
      </div>
    </div>
  );
}
