const fs = require('fs').promises;
const { getDataFile, getSeedFile, getWritableDataDir } = require('./appPaths');

const ENCOUNTERS_FILE = getDataFile('encounters.json');
const SEED_FILE = getSeedFile('encounters.seed.json');

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
  try {
    const content = await fs.readFile(ENCOUNTERS_FILE, 'utf8');
    return JSON.parse(content);
  } catch {
    return await seedStore();
  }
}

async function seedStore() {
  try {
    const raw = await fs.readFile(SEED_FILE, 'utf8');
    const store = JSON.parse(raw);
    const { generate } = require('./encounterMarkdownGenerator');
    store.encounters = (store.encounters || []).map(e => ({
      ...e,
      markdown: e.markdown || generate(e.data),
    }));
    await writeStore(store);
    return store;
  } catch {
    return { encounters: [] };
  }
}

async function writeStore(store) {
  await fs.mkdir(getWritableDataDir(), { recursive: true });
  await fs.writeFile(ENCOUNTERS_FILE, JSON.stringify(store, null, 2), 'utf8');
}

async function getAllFull() {
  const store = await readStore();
  return orderedEncounters(store.encounters);
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
  return orderedEncounters(store.encounters).filter(belongs).map(e => ({
    id: e.id,
    name: e.name,
    sessionId: e.sessionId || null,
    fiction: e.fiction,
    createdAt: e.createdAt,
    isDemo: e.isDemo || false,
    tags: e.tags || [],
    campaignId: e.campaignId || 'c-default',
  }));
}

async function updateTags(id, tags) {
  const store = await readStore();
  const idx = store.encounters.findIndex(e => e.id === id);
  if (idx < 0) throw new Error(`Encounter ${id} not found`);
  store.encounters[idx].tags = tags;
  if (store.encounters[idx].data) store.encounters[idx].data.tags = tags;
  await writeStore(store);
  return tags;
}

async function getEncounter(id) {
  const store = await readStore();
  return store.encounters.find(e => e.id === id) || null;
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
    tags: Array.isArray(data.tags) ? data.tags : [],
    data: { ...data, id },
    markdown,
  };

  const idx = store.encounters.findIndex(e => e.id === id);
  if (idx >= 0) {
    encounter.createdAt = store.encounters[idx].createdAt;
    encounter.sortOrder = orderValue(store.encounters[idx], idx);
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

module.exports = { getAllEncounters, getAllFull, importEncounters, getEncounter, saveEncounter, deleteEncounter, updateTags, reorderEncounters };
