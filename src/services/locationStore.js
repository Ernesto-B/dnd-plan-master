const fs = require('fs').promises;
const { getDataFile, getWritableDataDir } = require('./appPaths');
const { ACTIVE, normalizeRecord, isActive, setStatus, matchesStatus } = require('./recordLifecycle');

const LOCATIONS_FILE = getDataFile('locations.json');

async function readStore() {
  try {
    const content = await fs.readFile(LOCATIONS_FILE, 'utf8');
    return JSON.parse(content);
  } catch {
    return { locations: [] };
  }
}

async function writeStore(store) {
  await fs.mkdir(getWritableDataDir(), { recursive: true });
  await fs.writeFile(LOCATIONS_FILE, JSON.stringify(store, null, 2), 'utf8');
}

async function replaceAllFull(locations) {
  await writeStore({ locations: Array.isArray(locations) ? locations : [] });
}

async function getAllLocations(campaignId) {
  const store = await readStore();
  const belongs = l =>
    !campaignId ||
    l.campaignId === campaignId ||
    (!l.campaignId && campaignId === 'c-default');
  return store.locations.map(normalizeRecord).filter(l => belongs(l) && isActive(l)).map(l => ({
    id:             l.id,
    name:           l.name,
    description:    l.description || '',
    government:     l.government || '',
    linkedSessions: l.linkedSessions || [],
    tags:           l.tags || [],
    createdAt:      l.createdAt,
    isDemo:         l.isDemo || false,
    campaignId:     l.campaignId || 'c-default',
  }));
}

async function getAllFull() {
  const store = await readStore();
  return store.locations.map(normalizeRecord);
}

async function importLocations(incoming) {
  const store = await readStore();
  let count = 0;
  for (const location of incoming) {
    if (!location.id) continue;
    if (!store.locations.find(existing => existing.id === location.id)) {
      store.locations.push(location);
      count++;
    }
  }
  if (count > 0) {
    store.locations.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
    await writeStore(store);
  }
  return count;
}

async function getLocation(id) {
  const store = await readStore();
  const found = store.locations.find(l => l.id === id);
  return found ? normalizeRecord(found) : null;
}

function randomId() {
  return 'l-' + Math.random().toString(36).slice(2, 8);
}

function sanitizeDistricts(districts) {
  if (!Array.isArray(districts)) return [];
  return districts.map(d => ({
    name:      String(d?.name || '').trim(),
    readAloud: String(d?.readAloud || '').trim(),
    pointsOfInterest: Array.isArray(d?.pointsOfInterest)
      ? d.pointsOfInterest.map(p => ({
          name:        String(p?.name || '').trim(),
          description: String(p?.description || '').trim(),
        })).filter(p => p.name || p.description)
      : [],
  }));
}

async function saveLocation(data) {
  const store = await readStore();
  const id = data.id || randomId();

  const location = {
    id,
    campaignId:          data.campaignId || 'c-default',
    name:                String(data.name || '').trim(),
    government:          String(data.government || '').trim(),
    populationSize:      String(data.populationSize || '').trim(),
    populationDiversity: String(data.populationDiversity || '').trim(),
    languages:           String(data.languages || '').trim(),
    resources:           String(data.resources || '').trim(),
    funFact:             String(data.funFact || '').trim(),
    description:         String(data.description || '').trim(),
    sensoryDetail:       String(data.sensoryDetail || '').trim(),
    hiddenDetail:        String(data.hiddenDetail || '').trim(),
    districts:           sanitizeDistricts(data.districts),
    onTheHorizon:        String(data.onTheHorizon || '').trim(),
    linkedSessions:      Array.isArray(data.linkedSessions) ? data.linkedSessions : [],
    tags:                Array.isArray(data.tags) ? data.tags : [],
    createdAt:           new Date().toISOString(),
    isDemo:              data.isDemo || false,
    status:              ACTIVE,
  };

  const idx = store.locations.findIndex(l => l.id === id);
  if (idx >= 0) {
    location.createdAt = store.locations[idx].createdAt;
    location.status = normalizeRecord(store.locations[idx]).status;
    if (store.locations[idx].archivedAt) location.archivedAt = store.locations[idx].archivedAt;
    if (store.locations[idx].trashedAt) location.trashedAt = store.locations[idx].trashedAt;
    store.locations[idx] = location;
  } else {
    store.locations.push(location);
  }

  store.locations.sort((a, b) => a.name.localeCompare(b.name));
  await writeStore(store);
  return location;
}

async function deleteLocation(id) {
  const store = await readStore();
  const before = store.locations.length;
  store.locations = store.locations.filter(l => l.id !== id);
  if (store.locations.length === before) throw new Error(`Location ${id} not found`);
  await writeStore(store);
}

async function updateTags(id, tags) {
  const store = await readStore();
  const idx = store.locations.findIndex(l => l.id === id);
  if (idx < 0) throw new Error(`Location ${id} not found`);
  store.locations[idx].tags = tags;
  await writeStore(store);
  return tags;
}

async function syncSessionLinks(sessionId, newLocationIds, oldLocationIds) {
  const toAdd    = newLocationIds.filter(id => !oldLocationIds.includes(id));
  const toRemove = oldLocationIds.filter(id => !newLocationIds.includes(id));
  if (!toAdd.length && !toRemove.length) return;

  const store = await readStore();
  let changed = false;

  for (const location of store.locations) {
    if (toAdd.includes(location.id)) {
      if (!location.linkedSessions) location.linkedSessions = [];
      if (!location.linkedSessions.includes(sessionId)) {
        location.linkedSessions.push(sessionId);
        changed = true;
      }
    }
    if (toRemove.includes(location.id)) {
      if (!location.linkedSessions) continue;
      const before = location.linkedSessions.length;
      location.linkedSessions = location.linkedSessions.filter(s => s !== sessionId);
      if (location.linkedSessions.length !== before) changed = true;
    }
  }

  if (changed) await writeStore(store);
}

async function updateStatus(id, status) {
  const store = await readStore();
  const idx = store.locations.findIndex(l => l.id === id);
  if (idx < 0) throw new Error(`Location ${id} not found`);
  store.locations[idx] = setStatus(store.locations[idx], status);
  await writeStore(store);
  return normalizeRecord(store.locations[idx]);
}

async function listByStatuses(campaignId, statuses = [ACTIVE]) {
  const store = await readStore();
  const belongs = l =>
    !campaignId ||
    l.campaignId === campaignId ||
    (!l.campaignId && campaignId === 'c-default');
  return store.locations.map(normalizeRecord).filter(l => belongs(l) && matchesStatus(l, statuses));
}

module.exports = {
  getAllLocations,
  getAllFull,
  getLocation,
  saveLocation,
  deleteLocation,
  updateTags,
  importLocations,
  syncSessionLinks,
  replaceAllFull,
  updateStatus,
  listByStatuses,
};
