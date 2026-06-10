const { getDataFile } = require('./appPaths');
const { migrateCampaignStore, STORE_SCHEMA_VERSION } = require('./schema');
const { readVersionedStore, writeVersionedStore } = require('./versionedStore');

const CAMPAIGNS_FILE = getDataFile('campaigns.json');

function randomId() {
  return 'c-' + Math.random().toString(36).slice(2, 8);
}

async function readStore() {
  return readVersionedStore(
    CAMPAIGNS_FILE,
    () => ({ schemaVersion: STORE_SCHEMA_VERSION, campaigns: [], activeCampaignId: null }),
    migrateCampaignStore,
  );
}

async function writeStore(store) {
  await writeVersionedStore(CAMPAIGNS_FILE, migrateCampaignStore(store));
}

// Called at server startup. Creates default campaign if none exist.
// Returns { firstLaunch } so the caller can seed the demo campaign exactly once.
async function init() {
  const store = await readStore();
  let changed = false;
  let firstLaunch = false;

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
    firstLaunch = true;
  }

  if (!store.activeCampaignId || !store.campaigns.find(c => c.id === store.activeCampaignId)) {
    store.activeCampaignId = store.campaigns[0].id;
    changed = true;
  }

  if (changed) await writeStore(store);
  return { firstLaunch };
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

async function createCampaign({ name, description = '', isDemo = false }) {
  const store = await readStore();
  const id = randomId();
  const campaign = {
    id,
    name:        String(name || 'New Campaign').trim(),
    description: String(description || '').trim(),
    createdAt:   new Date().toISOString(),
    partyRoster: [],
    ...(isDemo ? { isDemo: true } : {}),
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
