const fs = require('fs').promises;
const path = require('path');

const sessionStore = require('./sessionStore');
const encounterStore = require('./encounterStore');
const settingsStore = require('./settingsStore');
const { getWritableDataDir, getDataFile } = require('./appPaths');

const BACKUP_DIR = path.join(getWritableDataDir(), 'backups');
const MAX_BACKUPS = 20;

function backupFilePath(name) {
  return path.join(BACKUP_DIR, name);
}

function backupName() {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `backup-${stamp}.json`;
}

async function ensureBackupDir() {
  await fs.mkdir(BACKUP_DIR, { recursive: true });
}

async function createBackup() {
  await ensureBackupDir();
  const payload = {
    createdAt: new Date().toISOString(),
    settings: await settingsStore.getSettings(),
    sessions: await sessionStore.getAllFull(),
    encounters: await encounterStore.getAllFull(),
  };

  const name = backupName();
  await fs.writeFile(backupFilePath(name), JSON.stringify(payload, null, 2), 'utf8');
  await pruneOldBackups();
  return { name, createdAt: payload.createdAt };
}

async function pruneOldBackups() {
  const names = (await fs.readdir(BACKUP_DIR)).filter(name => name.endsWith('.json')).sort().reverse();
  const extra = names.slice(MAX_BACKUPS);
  await Promise.allSettled(extra.map(name => fs.unlink(backupFilePath(name))));
}

async function listBackups() {
  try {
    await ensureBackupDir();
    const names = (await fs.readdir(BACKUP_DIR)).filter(name => name.endsWith('.json')).sort().reverse();
    const items = [];
    for (const name of names) {
      try {
        const raw = await fs.readFile(backupFilePath(name), 'utf8');
        const parsed = JSON.parse(raw);
        items.push({
          name,
          createdAt: parsed.createdAt || null,
          sessionCount: Array.isArray(parsed.sessions) ? parsed.sessions.length : 0,
          encounterCount: Array.isArray(parsed.encounters) ? parsed.encounters.length : 0,
        });
      } catch {
        items.push({ name, createdAt: null, sessionCount: 0, encounterCount: 0 });
      }
    }
    return items;
  } catch {
    return [];
  }
}

async function restoreBackup(name) {
  const raw = await fs.readFile(backupFilePath(name), 'utf8');
  const parsed = JSON.parse(raw);

  await fs.mkdir(getWritableDataDir(), { recursive: true });
  await fs.writeFile(getDataFile('sessions.json'), JSON.stringify({ sessions: parsed.sessions || [] }, null, 2), 'utf8');
  await fs.writeFile(getDataFile('encounters.json'), JSON.stringify({ encounters: parsed.encounters || [] }, null, 2), 'utf8');
  await fs.writeFile(getDataFile('settings.json'), JSON.stringify({ ...(parsed.settings || {}) }, null, 2), 'utf8');

  return {
    sessionCount: Array.isArray(parsed.sessions) ? parsed.sessions.length : 0,
    encounterCount: Array.isArray(parsed.encounters) ? parsed.encounters.length : 0,
  };
}

module.exports = {
  createBackup,
  listBackups,
  restoreBackup,
};
