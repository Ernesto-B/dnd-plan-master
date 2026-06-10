const { getDataFile } = require('./appPaths');
const { DEFAULT_SETTINGS, migrateSettingsStore } = require('./schema');
const { readVersionedStore, writeVersionedStore } = require('./versionedStore');

const SETTINGS_FILE = getDataFile('settings.json');

async function getSettings() {
  return readVersionedStore(SETTINGS_FILE, () => migrateSettingsStore(DEFAULT_SETTINGS), migrateSettingsStore);
}

async function saveSettings(settings) {
  const current = await getSettings();
  const merged = migrateSettingsStore({
    ...current,
    ...settings,
    shortcuts: {
      ...(current.shortcuts || {}),
      ...(settings.shortcuts || {}),
    },
  });
  await writeVersionedStore(SETTINGS_FILE, merged);
  return merged;
}

module.exports = { getSettings, saveSettings };
