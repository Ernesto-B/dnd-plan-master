const { getDataFile } = require('./appPaths');
const { ACTIVE, DRAFT, normalizeRecord, normalizeTagsForStatus, isLive, setStatus, matchesStatus } = require('./recordLifecycle');
const { migrateSessionStore, STORE_SCHEMA_VERSION } = require('./schema');
const { readVersionedStore, writeVersionedStore } = require('./versionedStore');

const SESSIONS_FILE = getDataFile('sessions.json');

function orderValue(item, fallbackIndex) {
  return Number.isFinite(item?.sortOrder) ? item.sortOrder : fallbackIndex;
}

function orderedSessions(items) {
  return (items || [])
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const orderDiff = orderValue(a.item, a.index) - orderValue(b.item, b.index);
      if (orderDiff !== 0) return orderDiff;
      return (parseFloat(a.item.sessionNumber) || 0) - (parseFloat(b.item.sessionNumber) || 0);
    })
    .map(entry => entry.item);
}

function nextSortOrder(items) {
  return (items || []).reduce((max, item, index) => Math.max(max, orderValue(item, index)), -1) + 1;
}

async function readStore() {
  return readVersionedStore(
    SESSIONS_FILE,
    () => ({ schemaVersion: STORE_SCHEMA_VERSION, sessions: [] }),
    migrateSessionStore,
  );
}

async function writeStore(store) {
  await writeVersionedStore(SESSIONS_FILE, migrateSessionStore(store));
}

async function replaceAllFull(sessions) {
  await writeStore({ schemaVersion: STORE_SCHEMA_VERSION, sessions: Array.isArray(sessions) ? sessions : [] });
}

async function getAllFull() {
  const store = await readStore();
  return orderedSessions(store.sessions.map(normalizeRecord));
}

async function importSessions(incoming) {
  const store = await readStore();
  let count = 0;
  for (const s of incoming) {
    if (!s.id) continue;
    if (!store.sessions.find(x => x.id === s.id)) {
      store.sessions.push(s);
      count++;
    }
  }
  if (count > 0) {
    await writeStore(store);
  }
  return count;
}

async function getAllSessions(campaignId) {
  const store = await readStore();
  const belongs = s =>
    !campaignId ||
    s.campaignId === campaignId ||
    (!s.campaignId && campaignId === 'c-default');
  return orderedSessions(store.sessions.map(normalizeRecord)).filter(s => belongs(s) && isLive(s)).map(s => ({
    id: s.id,
    sessionNumber: s.sessionNumber,
    date: s.date,
    partyLevel: s.partyLevel,
    goal: s.goal,
    createdAt: s.createdAt,
    status: s.status || ACTIVE,
    isDemo: s.isDemo || false,
    tags: s.tags || [],
    campaignId: s.campaignId || 'c-default',
  }));
}

async function updateTags(id, tags) {
  const store = await readStore();
  const idx = store.sessions.findIndex(s => s.id === id);
  if (idx < 0) throw new Error(`Session ${id} not found`);
  const current = normalizeRecord(store.sessions[idx]);
  const normalizedTags = normalizeTagsForStatus(tags, current.status);
  store.sessions[idx].tags = normalizedTags;
  if (store.sessions[idx].data) store.sessions[idx].data.tags = normalizedTags;
  await writeStore(store);
  return normalizedTags;
}

async function updateLinks(id, patch) {
  const store = await readStore();
  const idx = store.sessions.findIndex(s => s.id === id);
  if (idx < 0) throw new Error(`Session ${id} not found`);
  const s = store.sessions[idx];
  if (!s.data) s.data = {};
  if (Array.isArray(patch.linkedNpcs)) s.data.linkedNpcs = patch.linkedNpcs;
  if (Array.isArray(patch.linkedLocations)) s.data.linkedLocations = patch.linkedLocations;
  await writeStore(store);
  return normalizeRecord(s);
}

async function getSession(id) {
  const store = await readStore();
  const found = store.sessions.find(s => s.id === id);
  return found ? normalizeRecord(found) : null;
}

function randomId() {
  return 's-' + Math.random().toString(36).slice(2, 8);
}

async function saveSession(data, markdown) {
  const store = await readStore();
  const sessionNumber = (data.sessionNumber != null && data.sessionNumber !== '')
    ? data.sessionNumber
    : (store.sessions.length + 1);
  // Preserve existing ID on edit; generate random ID for new sessions
  const id = data.id || randomId();

  const session = {
    id,
    campaignId: data.campaignId || 'c-default',
    sessionNumber,
    date: data.date,
    partyLevel: data.partyLevel,
    goal: data.sessionGoal,
    createdAt: new Date().toISOString(),
    sortOrder: nextSortOrder(store.sessions),
    tags: normalizeTagsForStatus(data.tags, data.status || ACTIVE),
    status: data.status === DRAFT ? DRAFT : ACTIVE,
    data: { ...data, id },
    markdown,
  };
  session.data.tags = session.tags;

  const idx = store.sessions.findIndex(s => s.id === id);
  if (idx >= 0) {
    session.createdAt = store.sessions[idx].createdAt;
    session.sortOrder = orderValue(store.sessions[idx], idx);
    session.status = normalizeRecord(store.sessions[idx]).status;
    session.tags = normalizeTagsForStatus(data.tags, session.status);
    session.data.tags = session.tags;
    if (store.sessions[idx].archivedAt) session.archivedAt = store.sessions[idx].archivedAt;
    if (store.sessions[idx].trashedAt) session.trashedAt = store.sessions[idx].trashedAt;
    if (store.sessions[idx].restorableStatus) session.restorableStatus = store.sessions[idx].restorableStatus;
    store.sessions[idx] = session;
  } else {
    store.sessions.push(session);
  }

  await writeStore(store);
  return session;
}

async function reorderSessions(ids, campaignId) {
  const store = await readStore();
  const belongs = session =>
    !campaignId ||
    session.campaignId === campaignId ||
    (!session.campaignId && campaignId === 'c-default');

  const campaignSessions = orderedSessions(store.sessions).filter(belongs);
  const allowedIds = new Set(campaignSessions.map(session => session.id));
  const requestedIds = [];
  for (const id of Array.isArray(ids) ? ids : []) {
    if (allowedIds.has(id) && !requestedIds.includes(id)) requestedIds.push(id);
  }
  const finalIds = [
    ...requestedIds,
    ...campaignSessions.map(session => session.id).filter(id => !requestedIds.includes(id)),
  ];
  const orderMap = new Map(finalIds.map((id, index) => [id, index]));

  store.sessions.forEach((session, index) => {
    if (!belongs(session)) return;
    session.sortOrder = orderMap.has(session.id)
      ? orderMap.get(session.id)
      : orderValue(session, index);
  });

  await writeStore(store);
  return orderedSessions(store.sessions).filter(belongs);
}

async function deleteSession(id) {
  const store = await readStore();
  const before = store.sessions.length;
  store.sessions = store.sessions.filter(s => s.id !== id);
  if (store.sessions.length === before) throw new Error(`Session ${id} not found`);
  await writeStore(store);
}

async function updateStatus(id, status) {
  const store = await readStore();
  const idx = store.sessions.findIndex(s => s.id === id);
  if (idx < 0) throw new Error(`Session ${id} not found`);
  store.sessions[idx] = setStatus(store.sessions[idx], status);
  await writeStore(store);
  return normalizeRecord(store.sessions[idx]);
}

async function updateRunState(id, runState) {
  const store = await readStore();
  const idx = store.sessions.findIndex(s => s.id === id);
  if (idx < 0) throw new Error(`Session ${id} not found`);
  store.sessions[idx].runState = runState;
  await writeStore(store);
  return runState;
}

async function listByStatuses(campaignId, statuses = [ACTIVE]) {
  const store = await readStore();
  const belongs = s =>
    !campaignId ||
    s.campaignId === campaignId ||
    (!s.campaignId && campaignId === 'c-default');
  return orderedSessions(store.sessions.map(normalizeRecord)).filter(s => belongs(s) && matchesStatus(s, statuses));
}

module.exports = { getAllSessions, getAllFull, importSessions, getSession, saveSession, deleteSession, updateTags, updateLinks, reorderSessions, replaceAllFull, updateStatus, listByStatuses, updateRunState };
