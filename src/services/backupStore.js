const fs = require('fs').promises;
const path = require('path');

const sessionStore = require('./sessionStore');
const encounterStore = require('./encounterStore');
const npcStore = require('./npcStore');
const locationStore = require('./locationStore');
const factionStore = require('./factionStore');
const settingsStore = require('./settingsStore');
const mapBundle = require('./mapBundle');
const {
  BUNDLE_SCHEMA_VERSION,
  migrateSessionStore,
  migrateEncounterStore,
  migrateNpcStore,
  migrateLocationStore,
  migrateFactionStore,
  migrateSettingsStore,
} = require('./schema');
const { getWritableDataDir, getDataFile } = require('./appPaths');
const { writeVersionedStore } = require('./versionedStore');

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
    schemaVersion: BUNDLE_SCHEMA_VERSION,
    createdAt: new Date().toISOString(),
    settings: await settingsStore.getSettings(),
    sessions: await sessionStore.getAllFull(),
    encounters: await encounterStore.getAllFull(),
    npcs: await npcStore.getAllFull(),
    locations: await locationStore.getAllFull(),
    factions: await factionStore.getAllFull(),
    maps: await mapBundle.serializeAllMaps(),
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
          npcCount: Array.isArray(parsed.npcs) ? parsed.npcs.length : 0,
          locationCount: Array.isArray(parsed.locations) ? parsed.locations.length : 0,
          factionCount: Array.isArray(parsed.factions) ? parsed.factions.length : 0,
          mapCount: Array.isArray(parsed.maps) ? parsed.maps.length : 0,
        });
      } catch {
        items.push({ name, createdAt: null, sessionCount: 0, encounterCount: 0, npcCount: 0, locationCount: 0, factionCount: 0, mapCount: 0 });
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
  await writeVersionedStore(getDataFile('sessions.json'), migrateSessionStore({ sessions: parsed.sessions || [] }));
  await writeVersionedStore(getDataFile('encounters.json'), migrateEncounterStore({ encounters: parsed.encounters || [] }));
  await writeVersionedStore(getDataFile('npcs.json'), migrateNpcStore({ npcs: parsed.npcs || [] }));
  await writeVersionedStore(getDataFile('locations.json'), migrateLocationStore({ locations: parsed.locations || [] }));
  await writeVersionedStore(getDataFile('factions.json'), migrateFactionStore({ factions: parsed.factions || [] }));
  await writeVersionedStore(getDataFile('settings.json'), migrateSettingsStore(parsed.settings || {}));
  const restoredMaps = await mapBundle.replaceAllMapsFromBundles(parsed.maps || []);

  return {
    sessionCount: Array.isArray(parsed.sessions) ? parsed.sessions.length : 0,
    encounterCount: Array.isArray(parsed.encounters) ? parsed.encounters.length : 0,
    npcCount: Array.isArray(parsed.npcs) ? parsed.npcs.length : 0,
    locationCount: Array.isArray(parsed.locations) ? parsed.locations.length : 0,
    factionCount: Array.isArray(parsed.factions) ? parsed.factions.length : 0,
    mapCount: restoredMaps.length,
  };
}

module.exports = {
  createBackup,
  listBackups,
  restoreBackup,
};
