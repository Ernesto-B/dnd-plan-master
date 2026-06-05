const fs = require('fs').promises;
const { getDataFile, getSeedFile, getWritableDataDir } = require('./appPaths');

const SESSIONS_FILE = getDataFile('sessions.json');
const SEED_FILE = getSeedFile('seed.json');

async function readStore() {
  try {
    const content = await fs.readFile(SESSIONS_FILE, 'utf8');
    return JSON.parse(content);
  } catch {
    return await seedStore();
  }
}

async function seedStore() {
  try {
    const raw = await fs.readFile(SEED_FILE, 'utf8');
    const store = JSON.parse(raw);
    const { generate } = require('./markdownGenerator');
    store.sessions = (store.sessions || []).map(s => ({
      ...s,
      markdown: s.markdown || generate(s.data),
    }));
    await writeStore(store);
    return store;
  } catch {
    return { sessions: [] };
  }
}

async function writeStore(store) {
  await fs.mkdir(getWritableDataDir(), { recursive: true });
  await fs.writeFile(SESSIONS_FILE, JSON.stringify(store, null, 2), 'utf8');
}

async function getAllFull() {
  const store = await readStore();
  return store.sessions;
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
    store.sessions.sort((a, b) => (a.sessionNumber || 0) - (b.sessionNumber || 0));
    await writeStore(store);
  }
  return count;
}

async function getAllSessions() {
  const store = await readStore();
  return store.sessions.map(s => ({
    id: s.id,
    sessionNumber: s.sessionNumber,
    date: s.date,
    partyLevel: s.partyLevel,
    goal: s.goal,
    createdAt: s.createdAt,
    isDemo: s.isDemo || false,
    tags: s.tags || [],
  }));
}

async function updateTags(id, tags) {
  const store = await readStore();
  const idx = store.sessions.findIndex(s => s.id === id);
  if (idx < 0) throw new Error(`Session ${id} not found`);
  store.sessions[idx].tags = tags;
  if (store.sessions[idx].data) store.sessions[idx].data.tags = tags;
  await writeStore(store);
  return tags;
}

async function getSession(id) {
  const store = await readStore();
  return store.sessions.find(s => s.id === id) || null;
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
    sessionNumber,
    date: data.date,
    partyLevel: data.partyLevel,
    goal: data.sessionGoal,
    createdAt: new Date().toISOString(),
    tags: Array.isArray(data.tags) ? data.tags : [],
    data: { ...data, id },
    markdown,
  };

  const idx = store.sessions.findIndex(s => s.id === id);
  if (idx >= 0) {
    session.createdAt = store.sessions[idx].createdAt;
    store.sessions[idx] = session;
  } else {
    store.sessions.push(session);
  }

  store.sessions.sort((a, b) => parseFloat(a.sessionNumber) - parseFloat(b.sessionNumber));
  await writeStore(store);
  return session;
}

async function deleteSession(id) {
  const store = await readStore();
  const before = store.sessions.length;
  store.sessions = store.sessions.filter(s => s.id !== id);
  if (store.sessions.length === before) throw new Error(`Session ${id} not found`);
  await writeStore(store);
}

module.exports = { getAllSessions, getAllFull, importSessions, getSession, saveSession, deleteSession, updateTags };
