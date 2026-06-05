const fs = require('fs').promises;
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');

const DEFAULTS = { party: [] };

async function getSettings() {
  try {
    const content = await fs.readFile(SETTINGS_FILE, 'utf8');
    return { ...DEFAULTS, ...JSON.parse(content) };
  } catch {
    return DEFAULTS;
  }
}

async function saveSettings(settings) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const merged = { ...DEFAULTS, ...settings };
  await fs.writeFile(SETTINGS_FILE, JSON.stringify(merged, null, 2), 'utf8');
  return merged;
}

module.exports = { getSettings, saveSettings };
