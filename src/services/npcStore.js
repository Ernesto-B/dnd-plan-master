const { getDataFile } = require('./appPaths');
const { ACTIVE, DRAFT, normalizeRecord, normalizeTagsForStatus, isLive, setStatus, matchesStatus } = require('./recordLifecycle');
const { migrateNpcStore, STORE_SCHEMA_VERSION } = require('./schema');
const { readVersionedStore, writeVersionedStore } = require('./versionedStore');

const NPCS_FILE = getDataFile('npcs.json');

function orderValue(item, fallbackIndex) {
  return Number.isFinite(item?.sortOrder) ? item.sortOrder : fallbackIndex;
}

function orderedNpcs(items) {
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
    NPCS_FILE,
    () => ({ schemaVersion: STORE_SCHEMA_VERSION, npcs: [] }),
    migrateNpcStore,
  );
}

async function writeStore(store) {
  await writeVersionedStore(NPCS_FILE, migrateNpcStore(store));
}

async function replaceAllFull(npcs) {
  await writeStore({ schemaVersion: STORE_SCHEMA_VERSION, npcs: Array.isArray(npcs) ? npcs : [] });
}

async function getAllNpcs(campaignId) {
  const store = await readStore();
  const belongs = n =>
    !campaignId ||
    n.campaignId === campaignId ||
    (!n.campaignId && campaignId === 'c-default');
  return orderedNpcs(store.npcs.map(normalizeRecord)).filter(n => belongs(n) && isLive(n)).map(n => ({
    id:               n.id,
    name:             n.name,
    nickname:         n.nickname || '',
    situation:        n.situation || '',
    linkedSessions:   n.linkedSessions  || [],
    linkedEncounters: n.linkedEncounters || [],
    tags:             n.tags || [],
    createdAt:        n.createdAt,
    status:           n.status || ACTIVE,
    isDemo:           n.isDemo || false,
    campaignId:       n.campaignId || 'c-default',
  }));
}

async function getAllFull() {
  const store = await readStore();
  return orderedNpcs(store.npcs.map(normalizeRecord));
}

async function getNpc(id) {
  const store = await readStore();
  const found = store.npcs.find(n => n.id === id);
  return found ? normalizeRecord(found) : null;
}

function randomId() {
  return 'n-' + Math.random().toString(36).slice(2, 8);
}

async function saveNpc(data) {
  const store = await readStore();
  const id = data.id || randomId();

  const npc = {
    id,
    campaignId:       data.campaignId || 'c-default',
    name:             String(data.name  || '').trim(),
    nickname:         String(data.nickname  || '').trim(),
    commonPhrase:     String(data.commonPhrase   || '').trim(),
    appearance:       String(data.appearance     || '').trim(),
    skillDescriptions: (data.skillDescriptions && typeof data.skillDescriptions === 'object')
      ? data.skillDescriptions : {},
    situation:        String(data.situation     || '').trim(),
    wantsNeeds:       String(data.wantsNeeds    || '').trim(),
    secretObstacle:   String(data.secretObstacle || '').trim(),
    carrying:         Array.isArray(data.carrying)
      ? data.carrying.map(s => String(s).trim()).filter(Boolean)
      : String(data.carrying || '').split('\n').map(s => s.trim()).filter(Boolean),
    linkedSessions:   Array.isArray(data.linkedSessions)   ? data.linkedSessions   : [],
    linkedEncounters: Array.isArray(data.linkedEncounters) ? data.linkedEncounters : [],
    tags:             normalizeTagsForStatus(data.tags, data.status || ACTIVE),
    createdAt:        new Date().toISOString(),
    sortOrder:        nextSortOrder(store.npcs),
    isDemo:           data.isDemo || false,
    status:           data.status === DRAFT ? DRAFT : ACTIVE,
  };

  const idx = store.npcs.findIndex(n => n.id === id);
  if (idx >= 0) {
    npc.createdAt = store.npcs[idx].createdAt;
    npc.sortOrder = orderValue(store.npcs[idx], idx);
    npc.status = normalizeRecord(store.npcs[idx]).status;
    npc.tags = normalizeTagsForStatus(data.tags, npc.status);
    if (store.npcs[idx].archivedAt) npc.archivedAt = store.npcs[idx].archivedAt;
    if (store.npcs[idx].trashedAt) npc.trashedAt = store.npcs[idx].trashedAt;
    if (store.npcs[idx].restorableStatus) npc.restorableStatus = store.npcs[idx].restorableStatus;
    store.npcs[idx] = npc;
  } else {
    store.npcs.push(npc);
  }

  await writeStore(store);
  return npc;
}

async function deleteNpc(id) {
  const store = await readStore();
  const before = store.npcs.length;
  store.npcs = store.npcs.filter(n => n.id !== id);
  if (store.npcs.length === before) throw new Error(`NPC ${id} not found`);
  await writeStore(store);
}

async function updateLinks(id, patch) {
  const store = await readStore();
  const idx = store.npcs.findIndex(n => n.id === id);
  if (idx < 0) throw new Error(`NPC ${id} not found`);
  if (Array.isArray(patch.linkedSessions)) store.npcs[idx].linkedSessions = patch.linkedSessions;
  if (Array.isArray(patch.linkedEncounters)) store.npcs[idx].linkedEncounters = patch.linkedEncounters;
  await writeStore(store);
  return store.npcs[idx];
}

async function updateTags(id, tags) {
  const store = await readStore();
  const idx = store.npcs.findIndex(n => n.id === id);
  if (idx < 0) throw new Error(`NPC ${id} not found`);
  const current = normalizeRecord(store.npcs[idx]);
  store.npcs[idx].tags = normalizeTagsForStatus(tags, current.status);
  await writeStore(store);
  return store.npcs[idx].tags;
}

async function importNpcs(incoming) {
  const store = await readStore();
  let count = 0;
  for (const n of incoming) {
    if (!n.id) continue;
    if (!store.npcs.find(x => x.id === n.id)) {
      store.npcs.push(n);
      count++;
    }
  }
  if (count > 0) {
    await writeStore(store);
  }
  return count;
}

async function reorderNpcs(ids, campaignId) {
  const store = await readStore();
  const belongs = npc =>
    !campaignId ||
    npc.campaignId === campaignId ||
    (!npc.campaignId && campaignId === 'c-default');

  const campaignNpcs = orderedNpcs(store.npcs).filter(belongs);
  const allowedIds = new Set(campaignNpcs.map(npc => npc.id));
  const requestedIds = [];
  for (const id of Array.isArray(ids) ? ids : []) {
    if (allowedIds.has(id) && !requestedIds.includes(id)) requestedIds.push(id);
  }
  const finalIds = [
    ...requestedIds,
    ...campaignNpcs.map(npc => npc.id).filter(id => !requestedIds.includes(id)),
  ];
  const orderMap = new Map(finalIds.map((id, index) => [id, index]));

  store.npcs.forEach((npc, index) => {
    if (!belongs(npc)) return;
    npc.sortOrder = orderMap.has(npc.id)
      ? orderMap.get(npc.id)
      : orderValue(npc, index);
  });

  await writeStore(store);
  return orderedNpcs(store.npcs).filter(belongs);
}

async function syncSessionLinks(sessionId, newNpcIds, oldNpcIds) {
  const toAdd    = newNpcIds.filter(id => !oldNpcIds.includes(id));
  const toRemove = oldNpcIds.filter(id => !newNpcIds.includes(id));
  if (!toAdd.length && !toRemove.length) return;

  const store = await readStore();
  let changed = false;

  for (const npc of store.npcs) {
    if (toAdd.includes(npc.id)) {
      if (!npc.linkedSessions) npc.linkedSessions = [];
      if (!npc.linkedSessions.includes(sessionId)) {
        npc.linkedSessions.push(sessionId);
        changed = true;
      }
    }
    if (toRemove.includes(npc.id)) {
      if (!npc.linkedSessions) continue;
      const before = npc.linkedSessions.length;
      npc.linkedSessions = npc.linkedSessions.filter(s => s !== sessionId);
      if (npc.linkedSessions.length !== before) changed = true;
    }
  }

  if (changed) await writeStore(store);
}

async function updateStatus(id, status) {
  const store = await readStore();
  const idx = store.npcs.findIndex(n => n.id === id);
  if (idx < 0) throw new Error(`NPC ${id} not found`);
  store.npcs[idx] = setStatus(store.npcs[idx], status);
  await writeStore(store);
  return normalizeRecord(store.npcs[idx]);
}

async function listByStatuses(campaignId, statuses = [ACTIVE]) {
  const store = await readStore();
  const belongs = n =>
    !campaignId ||
    n.campaignId === campaignId ||
    (!n.campaignId && campaignId === 'c-default');
  return orderedNpcs(store.npcs.map(normalizeRecord)).filter(n => belongs(n) && matchesStatus(n, statuses));
}

module.exports = { getAllNpcs, getAllFull, getNpc, saveNpc, deleteNpc, updateTags, updateLinks, importNpcs, syncSessionLinks, reorderNpcs, replaceAllFull, updateStatus, listByStatuses };
