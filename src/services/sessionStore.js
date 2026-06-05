const fs = require('fs').promises;
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');
const SEED_FILE = path.join(DATA_DIR, 'seed.json');

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
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(SESSIONS_FILE, JSON.stringify(store, null, 2), 'utf8');
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
  }));
}

async function getSession(id) {
  const store = await readStore();
  return store.sessions.find(s => s.id === id) || null;
}

async function saveSession(data, markdown) {
  const store = await readStore();
  const sessionNumber = parseInt(data.sessionNumber) || (store.sessions.length + 1);
  const id = String(sessionNumber).padStart(3, '0');

  const session = {
    id,
    sessionNumber,
    date: data.date,
    partyLevel: data.partyLevel,
    goal: data.sessionGoal,
    createdAt: new Date().toISOString(),
    data,
    markdown,
  };

  const idx = store.sessions.findIndex(s => s.id === id);
  if (idx >= 0) {
    store.sessions[idx] = session;
  } else {
    store.sessions.push(session);
  }

  store.sessions.sort((a, b) => a.sessionNumber - b.sessionNumber);
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

module.exports = { getAllSessions, getSession, saveSession, deleteSession };
