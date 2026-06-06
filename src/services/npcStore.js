const fs = require('fs').promises;
const { getDataFile, getSeedFile, getWritableDataDir } = require('./appPaths');

const NPCS_FILE = getDataFile('npcs.json');
const SEED_FILE = getSeedFile('npcs.seed.json');

async function readStore() {
  try {
    const content = await fs.readFile(NPCS_FILE, 'utf8');
    return JSON.parse(content);
  } catch {
    return await seedStore();
  }
}

async function seedStore() {
  try {
    const raw = await fs.readFile(SEED_FILE, 'utf8');
    const store = JSON.parse(raw);
    await writeStore(store);
    return store;
  } catch {
    return { npcs: [] };
  }
}

async function writeStore(store) {
  await fs.mkdir(getWritableDataDir(), { recursive: true });
  await fs.writeFile(NPCS_FILE, JSON.stringify(store, null, 2), 'utf8');
}

async function getAllNpcs() {
  const store = await readStore();
  return store.npcs.map(n => ({
    id:               n.id,
    name:             n.name,
    nickname:         n.nickname || '',
    situation:        n.situation || '',
    linkedSessions:   n.linkedSessions  || [],
    linkedEncounters: n.linkedEncounters || [],
    tags:             n.tags || [],
    createdAt:        n.createdAt,
    isDemo:           n.isDemo || false,
  }));
}

async function getAllFull() {
  const store = await readStore();
  return store.npcs;
}

async function getNpc(id) {
  const store = await readStore();
  return store.npcs.find(n => n.id === id) || null;
}

function randomId() {
  return 'n-' + Math.random().toString(36).slice(2, 8);
}

async function saveNpc(data) {
  const store = await readStore();
  const id = data.id || randomId();

  const npc = {
    id,
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
    tags:             Array.isArray(data.tags)   ? data.tags   : [],
    createdAt:        new Date().toISOString(),
    isDemo:           data.isDemo || false,
  };

  const idx = store.npcs.findIndex(n => n.id === id);
  if (idx >= 0) {
    npc.createdAt = store.npcs[idx].createdAt;
    store.npcs[idx] = npc;
  } else {
    store.npcs.push(npc);
  }

  store.npcs.sort((a, b) => a.name.localeCompare(b.name));
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

async function updateTags(id, tags) {
  const store = await readStore();
  const idx = store.npcs.findIndex(n => n.id === id);
  if (idx < 0) throw new Error(`NPC ${id} not found`);
  store.npcs[idx].tags = tags;
  await writeStore(store);
  return tags;
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
    store.npcs.sort((a, b) => a.name.localeCompare(b.name));
    await writeStore(store);
  }
  return count;
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

module.exports = { getAllNpcs, getAllFull, getNpc, saveNpc, deleteNpc, updateTags, importNpcs, syncSessionLinks };
