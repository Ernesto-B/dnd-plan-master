const fs = require('fs').promises;
const { getDataFile, getWritableDataDir } = require('./appPaths');
const { ACTIVE, DRAFT, normalizeRecord, normalizeTagsForStatus, isLive, setStatus, matchesStatus } = require('./recordLifecycle');

const FACTIONS_FILE = getDataFile('factions.json');

function orderValue(item, fallbackIndex) {
  return Number.isFinite(item?.sortOrder) ? item.sortOrder : fallbackIndex;
}

function orderedFactions(items) {
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
  try {
    const content = await fs.readFile(FACTIONS_FILE, 'utf8');
    return JSON.parse(content);
  } catch {
    return { factions: [] };
  }
}

async function writeStore(store) {
  await fs.mkdir(getWritableDataDir(), { recursive: true });
  await fs.writeFile(FACTIONS_FILE, JSON.stringify(store, null, 2), 'utf8');
}

async function replaceAllFull(factions) {
  await writeStore({ factions: Array.isArray(factions) ? factions : [] });
}

function clampInteger(value, min, max, fallback = '') {
  if (value === '' || value == null) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function sanitizeClock(clock = {}) {
  const rawStepDescriptions = Array.isArray(clock.stepDescriptions) ? clock.stepDescriptions : [];
  const inferredSteps = rawStepDescriptions.length || clock.steps || 4;
  const steps = clampInteger(inferredSteps, 1, 8, 4);
  const stepDescriptions = Array.from({ length: steps }, (_, index) => String(rawStepDescriptions[index] || '').trim());
  return {
    name: String(clock.name || '').trim(),
    steps,
    advanceTrigger: String(clock.advanceTrigger || '').trim(),
    setbackTrigger: String(clock.setbackTrigger || '').trim(),
    stepDescriptions,
  };
}

function sanitizeClocks(clocks) {
  if (!Array.isArray(clocks)) return [];
  return clocks
    .slice(0, 3)
    .map(sanitizeClock)
    .filter(clock => clock.name || clock.advanceTrigger || clock.setbackTrigger || clock.stepDescriptions.some(Boolean));
}

function sanitizeLinkList(list) {
  return Array.isArray(list) ? list.filter(Boolean) : [];
}

async function getAllFactions(campaignId) {
  const store = await readStore();
  const belongs = faction =>
    !campaignId ||
    faction.campaignId === campaignId ||
    (!faction.campaignId && campaignId === 'c-default');
  return orderedFactions(store.factions.map(normalizeRecord)).filter(faction => belongs(faction) && isLive(faction)).map(faction => ({
    id: faction.id,
    name: faction.name,
    origin: faction.origin || '',
    goal: faction.goal || '',
    size: faction.size ?? '',
    partyReputation: faction.partyReputation ?? 0,
    linkedSessions: faction.linkedSessions || [],
    linkedEncounters: faction.linkedEncounters || [],
    linkedNpcs: faction.linkedNpcs || [],
    linkedLocations: faction.linkedLocations || [],
    tags: faction.tags || [],
    createdAt: faction.createdAt,
    status: faction.status || ACTIVE,
    isDemo: faction.isDemo || false,
    campaignId: faction.campaignId || 'c-default',
  }));
}

async function getAllFull() {
  const store = await readStore();
  return orderedFactions(store.factions.map(normalizeRecord));
}

async function getFaction(id) {
  const store = await readStore();
  const found = store.factions.find(faction => faction.id === id);
  return found ? normalizeRecord(found) : null;
}

function randomId() {
  return 'f-' + Math.random().toString(36).slice(2, 8);
}

async function saveFaction(data) {
  const store = await readStore();
  const id = data.id || randomId();

  const faction = {
    id,
    campaignId: data.campaignId || 'c-default',
    name: String(data.name || '').trim(),
    origin: String(data.origin || '').trim(),
    goal: String(data.goal || '').trim(),
    size: clampInteger(data.size, 0, 999999, ''),
    partyReputation: clampInteger(data.partyReputation, -3, 3, 0),
    factionClocks: sanitizeClocks(data.factionClocks),
    linkedSessions: sanitizeLinkList(data.linkedSessions),
    linkedEncounters: sanitizeLinkList(data.linkedEncounters),
    linkedNpcs: sanitizeLinkList(data.linkedNpcs),
    linkedLocations: sanitizeLinkList(data.linkedLocations),
    tags: normalizeTagsForStatus(data.tags, data.status || ACTIVE),
    createdAt: new Date().toISOString(),
    sortOrder: nextSortOrder(store.factions),
    isDemo: data.isDemo || false,
    status: data.status === DRAFT ? DRAFT : ACTIVE,
  };

  const idx = store.factions.findIndex(existing => existing.id === id);
  if (idx >= 0) {
    faction.createdAt = store.factions[idx].createdAt;
    faction.sortOrder = orderValue(store.factions[idx], idx);
    faction.status = normalizeRecord(store.factions[idx]).status;
    faction.tags = normalizeTagsForStatus(data.tags, faction.status);
    if (store.factions[idx].archivedAt) faction.archivedAt = store.factions[idx].archivedAt;
    if (store.factions[idx].trashedAt) faction.trashedAt = store.factions[idx].trashedAt;
    if (store.factions[idx].restorableStatus) faction.restorableStatus = store.factions[idx].restorableStatus;
    store.factions[idx] = faction;
  } else {
    store.factions.push(faction);
  }

  await writeStore(store);
  return faction;
}

async function deleteFaction(id) {
  const store = await readStore();
  const before = store.factions.length;
  store.factions = store.factions.filter(faction => faction.id !== id);
  if (store.factions.length === before) throw new Error(`Faction ${id} not found`);
  await writeStore(store);
}

async function updateTags(id, tags) {
  const store = await readStore();
  const idx = store.factions.findIndex(faction => faction.id === id);
  if (idx < 0) throw new Error(`Faction ${id} not found`);
  const current = normalizeRecord(store.factions[idx]);
  store.factions[idx].tags = normalizeTagsForStatus(tags, current.status);
  await writeStore(store);
  return store.factions[idx].tags;
}

async function importFactions(incoming) {
  const store = await readStore();
  let count = 0;
  for (const faction of incoming) {
    if (!faction.id) continue;
    if (!store.factions.find(existing => existing.id === faction.id)) {
      store.factions.push(faction);
      count++;
    }
  }
  if (count > 0) {
    await writeStore(store);
  }
  return count;
}

async function reorderFactions(ids, campaignId) {
  const store = await readStore();
  const belongs = faction =>
    !campaignId ||
    faction.campaignId === campaignId ||
    (!faction.campaignId && campaignId === 'c-default');

  const campaignFactions = orderedFactions(store.factions).filter(belongs);
  const allowedIds = new Set(campaignFactions.map(faction => faction.id));
  const requestedIds = [];
  for (const id of Array.isArray(ids) ? ids : []) {
    if (allowedIds.has(id) && !requestedIds.includes(id)) requestedIds.push(id);
  }
  const finalIds = [
    ...requestedIds,
    ...campaignFactions.map(faction => faction.id).filter(id => !requestedIds.includes(id)),
  ];
  const orderMap = new Map(finalIds.map((id, index) => [id, index]));

  store.factions.forEach((faction, index) => {
    if (!belongs(faction)) return;
    faction.sortOrder = orderMap.has(faction.id)
      ? orderMap.get(faction.id)
      : orderValue(faction, index);
  });

  await writeStore(store);
  return orderedFactions(store.factions).filter(belongs);
}

async function updateStatus(id, status) {
  const store = await readStore();
  const idx = store.factions.findIndex(faction => faction.id === id);
  if (idx < 0) throw new Error(`Faction ${id} not found`);
  store.factions[idx] = setStatus(store.factions[idx], status);
  await writeStore(store);
  return normalizeRecord(store.factions[idx]);
}

async function listByStatuses(campaignId, statuses = [ACTIVE]) {
  const store = await readStore();
  const belongs = faction =>
    !campaignId ||
    faction.campaignId === campaignId ||
    (!faction.campaignId && campaignId === 'c-default');
  return orderedFactions(store.factions.map(normalizeRecord)).filter(faction => belongs(faction) && matchesStatus(faction, statuses));
}

module.exports = {
  getAllFactions,
  getAllFull,
  getFaction,
  saveFaction,
  deleteFaction,
  updateTags,
  importFactions,
  reorderFactions,
  replaceAllFull,
  updateStatus,
  listByStatuses,
};
