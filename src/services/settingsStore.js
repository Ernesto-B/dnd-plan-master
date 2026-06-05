const fs = require('fs').promises;
const { getDataFile, getWritableDataDir } = require('./appPaths');

const SETTINGS_FILE = getDataFile('settings.json');

const DEFAULTS = {
  party: [],
  theme: 'dark',
  uiScale: 1,
  autosaveEnabled: true,
  scheduledBackupsEnabled: false,
  scheduledBackupIntervalHours: 24,
  shortcuts: {
    newSession: 'Alt+Shift+S',
    newEncounter: 'Alt+Shift+E',
    newNpc: 'Alt+Shift+N',
    goSessions: 'Alt+1',
    goEncounters: 'Alt+2',
    goNpcs: 'Alt+3',
    goCampaign: 'Alt+4',
    goSettings: 'Alt+5',
    focusSearch: '/',
    savePrimary: 'Mod+S',
  },
  templates: {
    npcs: [],
    locations: [],
    factionClocks: [],
    encounterPlans: [],
  },
};

async function getSettings() {
  try {
    const content = await fs.readFile(SETTINGS_FILE, 'utf8');
    const parsed = JSON.parse(content);
    return {
      ...DEFAULTS,
      ...parsed,
      shortcuts: { ...DEFAULTS.shortcuts, ...(parsed.shortcuts || {}) },
      templates: { ...DEFAULTS.templates, ...(parsed.templates || {}) },
    };
  } catch {
    return DEFAULTS;
  }
}

async function saveSettings(settings) {
  await fs.mkdir(getWritableDataDir(), { recursive: true });
  const current = await getSettings();
  const merged = {
    ...DEFAULTS,
    ...current,
    ...settings,
    shortcuts: {
      ...DEFAULTS.shortcuts,
      ...(current.shortcuts || {}),
      ...(settings.shortcuts || {}),
    },
    templates: {
      ...DEFAULTS.templates,
      ...(current.templates || {}),
      ...(settings.templates || {}),
    },
  };
  await fs.writeFile(SETTINGS_FILE, JSON.stringify(merged, null, 2), 'utf8');
  return merged;
}

module.exports = { getSettings, saveSettings };
