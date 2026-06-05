const fs = require('fs').promises;
const { getDataFile, getWritableDataDir } = require('./appPaths');

const SETTINGS_FILE = getDataFile('settings.json');

const DEFAULTS = { party: [], theme: 'dark', autosaveEnabled: true };

async function getSettings() {
  try {
    const content = await fs.readFile(SETTINGS_FILE, 'utf8');
    return { ...DEFAULTS, ...JSON.parse(content) };
  } catch {
    return DEFAULTS;
  }
}

async function saveSettings(settings) {
  await fs.mkdir(getWritableDataDir(), { recursive: true });
  const merged = { ...DEFAULTS, ...settings };
  await fs.writeFile(SETTINGS_FILE, JSON.stringify(merged, null, 2), 'utf8');
  return merged;
}

module.exports = { getSettings, saveSettings };
