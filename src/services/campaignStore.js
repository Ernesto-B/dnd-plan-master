const fs = require('fs').promises;
const { getDataFile, getWritableDataDir } = require('./appPaths');

const CAMPAIGNS_FILE = getDataFile('campaigns.json');

function randomId() {
  return 'c-' + Math.random().toString(36).slice(2, 8);
}

async function readStore() {
  try {
    const content = await fs.readFile(CAMPAIGNS_FILE, 'utf8');
    return JSON.parse(content);
  } catch {
    return { campaigns: [], activeCampaignId: null };
  }
}

async function writeStore(store) {
  await fs.mkdir(getWritableDataDir(), { recursive: true });
  await fs.writeFile(CAMPAIGNS_FILE, JSON.stringify(store, null, 2), 'utf8');
}

// Called at server startup. Creates default campaign if none exist.
async function init() {
  const store = await readStore();
  let changed = false;

  if (!store.campaigns || store.campaigns.length === 0) {
    store.campaigns = [{
      id: 'c-default',
      name: 'My Campaign',
      description: '',
      createdAt: new Date().toISOString(),
      partyRoster: [],
    }];
    store.activeCampaignId = 'c-default';
    changed = true;
  }

  if (!store.activeCampaignId || !store.campaigns.find(c => c.id === store.activeCampaignId)) {
    store.activeCampaignId = store.campaigns[0].id;
    changed = true;
  }

  if (changed) await writeStore(store);
  return store;
}

async function getAllCampaigns() {
  const store = await readStore();
  return store.campaigns;
}

async function getCampaign(id) {
  const store = await readStore();
  return store.campaigns.find(c => c.id === id) || null;
}

async function getActiveCampaignId() {
  const store = await readStore();
  if (store.activeCampaignId && store.campaigns.find(c => c.id === store.activeCampaignId)) {
    return store.activeCampaignId;
  }
  return store.campaigns[0]?.id ?? 'c-default';
}

async function getActiveCampaign() {
  const store = await readStore();
  const id = store.activeCampaignId || store.campaigns[0]?.id;
  return store.campaigns.find(c => c.id === id) || store.campaigns[0] || null;
}

async function setActiveCampaignId(id) {
  const store = await readStore();
  if (!store.campaigns.find(c => c.id === id)) throw new Error(`Campaign ${id} not found`);
  store.activeCampaignId = id;
  await writeStore(store);
  return id;
}

async function createCampaign({ name, description = '' }) {
  const store = await readStore();
  const id = randomId();
  const campaign = {
    id,
    name:        String(name || 'New Campaign').trim(),
    description: String(description || '').trim(),
    createdAt:   new Date().toISOString(),
    partyRoster: [],
  };
  store.campaigns.push(campaign);
  await writeStore(store);
  return campaign;
}

async function updateCampaign(id, { name, description }) {
  const store = await readStore();
  const idx = store.campaigns.findIndex(c => c.id === id);
  if (idx < 0) throw new Error(`Campaign ${id} not found`);
  if (name        !== undefined) store.campaigns[idx].name        = String(name).trim();
  if (description !== undefined) store.campaigns[idx].description = String(description).trim();
  await writeStore(store);
  return store.campaigns[idx];
}

async function deleteCampaign(id) {
  const store = await readStore();
  if (store.campaigns.length <= 1) throw new Error('Cannot delete the last campaign');
  const idx = store.campaigns.findIndex(c => c.id === id);
  if (idx < 0) throw new Error(`Campaign ${id} not found`);
  store.campaigns.splice(idx, 1);
  if (store.activeCampaignId === id) {
    store.activeCampaignId = store.campaigns[0].id;
  }
  await writeStore(store);
}

async function updateCampaignSettings(id, { partyRoster }) {
  const store = await readStore();
  const idx = store.campaigns.findIndex(c => c.id === id);
  if (idx < 0) throw new Error(`Campaign ${id} not found`);
  if (partyRoster !== undefined) store.campaigns[idx].partyRoster = partyRoster;
  await writeStore(store);
  return store.campaigns[idx];
}

module.exports = {
  init,
  getAllCampaigns,
  getCampaign,
  getActiveCampaignId,
  getActiveCampaign,
  setActiveCampaignId,
  createCampaign,
  updateCampaign,
  deleteCampaign,
  updateCampaignSettings,
};
