const { getDataFile } = require('./appPaths');
const { ACTIVE, DRAFT, normalizeRecord, normalizeTagsForStatus, isLive, setStatus, matchesStatus } = require('./recordLifecycle');
const { migrateEncounterStore, STORE_SCHEMA_VERSION } = require('./schema');
const { readVersionedStore, writeVersionedStore } = require('./versionedStore');

const ENCOUNTERS_FILE = getDataFile('encounters.json');

function orderValue(item, fallbackIndex) {
  return Number.isFinite(item?.sortOrder) ? item.sortOrder : fallbackIndex;
}

function orderedEncounters(items) {
  return (items || [])
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const orderDiff = orderValue(a.item, a.index) - orderValue(b.item, b.index);
      if (orderDiff !== 0) return orderDiff;
      return String(a.item.name || '').localeCompare(String(b.item.name || ''));
    })
    .map(entry => entry.item);
}

function nextSortOrder(items) {
  return (items || []).reduce((max, item, index) => Math.max(max, orderValue(item, index)), -1) + 1;
}

async function readStore() {
  return readVersionedStore(
    ENCOUNTERS_FILE,
    () => ({ schemaVersion: STORE_SCHEMA_VERSION, encounters: [] }),
    migrateEncounterStore,
  );
}

async function writeStore(store) {
  await writeVersionedStore(ENCOUNTERS_FILE, migrateEncounterStore(store));
}

async function replaceAllFull(encounters) {
  await writeStore({ schemaVersion: STORE_SCHEMA_VERSION, encounters: Array.isArray(encounters) ? encounters : [] });
}

async function getAllFull() {
  const store = await readStore();
  return orderedEncounters(store.encounters.map(normalizeRecord));
}

async function importEncounters(incoming) {
  const store = await readStore();
  let count = 0;
  for (const e of incoming) {
    if (!e.id) continue;
    if (!store.encounters.find(x => x.id === e.id)) {
      store.encounters.push(e);
      count++;
    }
  }
  if (count > 0) await writeStore(store);
  return count;
}

async function getAllEncounters(campaignId) {
  const store = await readStore();
  const belongs = e =>
    !campaignId ||
    e.campaignId === campaignId ||
    (!e.campaignId && campaignId === 'c-default');
  return orderedEncounters(store.encounters.map(normalizeRecord)).filter(e => belongs(e) && isLive(e)).map(e => ({
    id: e.id,
    name: e.name,
    sessionId: e.sessionId || null,
    fiction: e.fiction,
    createdAt: e.createdAt,
    status: e.status || ACTIVE,
    isDemo: e.isDemo || false,
    tags: e.tags || [],
    campaignId: e.campaignId || 'c-default',
  }));
}

async function updateTags(id, tags) {
  const store = await readStore();
  const idx = store.encounters.findIndex(e => e.id === id);
  if (idx < 0) throw new Error(`Encounter ${id} not found`);
  const current = normalizeRecord(store.encounters[idx]);
  const normalizedTags = normalizeTagsForStatus(tags, current.status);
  store.encounters[idx].tags = normalizedTags;
  if (store.encounters[idx].data) store.encounters[idx].data.tags = normalizedTags;
  await writeStore(store);
  return normalizedTags;
}

async function getEncounter(id) {
  const store = await readStore();
  const found = store.encounters.find(e => e.id === id);
  return found ? normalizeRecord(found) : null;
}

function randomId() {
  return 'e-' + Math.random().toString(36).slice(2, 8);
}

async function saveEncounter(data, markdown) {
  const store = await readStore();
  const id = data.id || randomId();

  const encounter = {
    id,
    campaignId: data.campaignId || 'c-default',
    name: data.name,
    sessionId: data.sessionId || null,
    fiction: data.fiction,
    createdAt: new Date().toISOString(),
    sortOrder: nextSortOrder(store.encounters),
    tags: normalizeTagsForStatus(data.tags, data.status || ACTIVE),
    status: data.status === DRAFT ? DRAFT : ACTIVE,
    data: { ...data, id },
    markdown,
  };
  encounter.data.tags = encounter.tags;

  const idx = store.encounters.findIndex(e => e.id === id);
  if (idx >= 0) {
    encounter.createdAt = store.encounters[idx].createdAt;
    encounter.sortOrder = orderValue(store.encounters[idx], idx);
    encounter.status = normalizeRecord(store.encounters[idx]).status;
    encounter.tags = normalizeTagsForStatus(data.tags, encounter.status);
    encounter.data.tags = encounter.tags;
    if (store.encounters[idx].archivedAt) encounter.archivedAt = store.encounters[idx].archivedAt;
    if (store.encounters[idx].trashedAt) encounter.trashedAt = store.encounters[idx].trashedAt;
    if (store.encounters[idx].restorableStatus) encounter.restorableStatus = store.encounters[idx].restorableStatus;
    store.encounters[idx] = encounter;
  } else {
    store.encounters.push(encounter);
  }

  await writeStore(store);
  return encounter;
}

async function reorderEncounters(ids, campaignId) {
  const store = await readStore();
  const belongs = encounter =>
    !campaignId ||
    encounter.campaignId === campaignId ||
    (!encounter.campaignId && campaignId === 'c-default');

  const campaignEncounters = orderedEncounters(store.encounters).filter(belongs);
  const allowedIds = new Set(campaignEncounters.map(encounter => encounter.id));
  const requestedIds = [];
  for (const id of Array.isArray(ids) ? ids : []) {
    if (allowedIds.has(id) && !requestedIds.includes(id)) requestedIds.push(id);
  }
  const finalIds = [
    ...requestedIds,
    ...campaignEncounters.map(encounter => encounter.id).filter(id => !requestedIds.includes(id)),
  ];
  const orderMap = new Map(finalIds.map((id, index) => [id, index]));

  store.encounters.forEach((encounter, index) => {
    if (!belongs(encounter)) return;
    encounter.sortOrder = orderMap.has(encounter.id)
      ? orderMap.get(encounter.id)
      : orderValue(encounter, index);
  });

  await writeStore(store);
  return orderedEncounters(store.encounters).filter(belongs);
}

async function deleteEncounter(id) {
  const store = await readStore();
  const before = store.encounters.length;
  store.encounters = store.encounters.filter(e => e.id !== id);
  if (store.encounters.length === before) throw new Error(`Encounter ${id} not found`);
  await writeStore(store);
}

async function updateStatus(id, status) {
  const store = await readStore();
  const idx = store.encounters.findIndex(e => e.id === id);
  if (idx < 0) throw new Error(`Encounter ${id} not found`);
  store.encounters[idx] = setStatus(store.encounters[idx], status);
  await writeStore(store);
  return normalizeRecord(store.encounters[idx]);
}

async function listByStatuses(campaignId, statuses = [ACTIVE]) {
  const store = await readStore();
  const belongs = e =>
    !campaignId ||
    e.campaignId === campaignId ||
    (!e.campaignId && campaignId === 'c-default');
  return orderedEncounters(store.encounters.map(normalizeRecord)).filter(e => belongs(e) && matchesStatus(e, statuses));
}

module.exports = { getAllEncounters, getAllFull, importEncounters, getEncounter, saveEncounter, deleteEncounter, updateTags, reorderEncounters, replaceAllFull, updateStatus, listByStatuses };
