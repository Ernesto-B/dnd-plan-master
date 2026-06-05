const fs = require('fs').promises;
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const ENCOUNTERS_FILE = path.join(DATA_DIR, 'encounters.json');
const SEED_FILE = path.join(DATA_DIR, 'encounters.seed.json');

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
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(ENCOUNTERS_FILE, JSON.stringify(store, null, 2), 'utf8');
}

async function getAllEncounters() {
  const store = await readStore();
  return store.encounters.map(e => ({
    id: e.id,
    name: e.name,
    sessionId: e.sessionId || null,
    fiction: e.fiction,
    createdAt: e.createdAt,
    isDemo: e.isDemo || false,
  }));
}

async function getEncounter(id) {
  const store = await readStore();
  return store.encounters.find(e => e.id === id) || null;
}

async function saveEncounter(data, markdown) {
  const store = await readStore();
  const id = data.id || `E${String(store.encounters.length + 1).padStart(3, '0')}`;

  const encounter = {
    id,
    name: data.name,
    sessionId: data.sessionId || null,
    fiction: data.fiction,
    createdAt: new Date().toISOString(),
    data,
    markdown,
  };

  const idx = store.encounters.findIndex(e => e.id === id);
  if (idx >= 0) {
    store.encounters[idx] = encounter;
  } else {
    store.encounters.push(encounter);
  }

  await writeStore(store);
  return encounter;
}

async function deleteEncounter(id) {
  const store = await readStore();
  const before = store.encounters.length;
  store.encounters = store.encounters.filter(e => e.id !== id);
  if (store.encounters.length === before) throw new Error(`Encounter ${id} not found`);
  await writeStore(store);
}

module.exports = { getAllEncounters, getEncounter, saveEncounter, deleteEncounter };
