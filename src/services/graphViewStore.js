const { getDataFile } = require('./appPaths');
const { readVersionedStore, writeVersionedStore } = require('./versionedStore');

const VIEWS_FILE = getDataFile('graph-views.json');
const STORE_SCHEMA_VERSION = 1;

function genId() {
  return 'gv-' + Math.random().toString(36).slice(2, 8);
}

function migrate(store) {
  if (!Array.isArray(store.views)) store.views = [];
  if (!store.schemaVersion) store.schemaVersion = STORE_SCHEMA_VERSION;
  return store;
}

async function readStore() {
  return readVersionedStore(
    VIEWS_FILE,
    () => ({ schemaVersion: STORE_SCHEMA_VERSION, views: [] }),
    migrate,
  );
}

async function writeStore(store) {
  await writeVersionedStore(VIEWS_FILE, migrate(store));
}

async function getViewsForCampaign(campaignId) {
  const store = await readStore();
  return store.views.filter(v => v.campaignId === campaignId);
}

async function createView(campaignId, data) {
  const store = await readStore();
  // If this is marked default, clear any existing default for this campaign
  if (data.isDefault) {
    store.views.forEach(v => { if (v.campaignId === campaignId) v.isDefault = false; });
  }
  const view = {
    id: genId(),
    campaignId,
    name: String(data.name || 'Untitled').trim(),
    isDefault: data.isDefault === true,
    filters: Array.isArray(data.filters) ? data.filters : [],
    positions: data.positions && typeof data.positions === 'object' ? data.positions : {},
    viewport: data.viewport && typeof data.viewport === 'object' ? data.viewport : { scale: 1, ox: 0, oy: 0 },
    groups: Array.isArray(data.groups) ? data.groups : [],
    createdAt: new Date().toISOString(),
  };
  store.views.push(view);
  await writeStore(store);
  return view;
}

async function updateView(viewId, data) {
  const store = await readStore();
  const idx = store.views.findIndex(v => v.id === viewId);
  if (idx === -1) return null;
  const campaignId = store.views[idx].campaignId;
  // If promoting to default, clear any other default for this campaign
  if (data.isDefault === true) {
    store.views.forEach((v, i) => { if (v.campaignId === campaignId && i !== idx) v.isDefault = false; });
  }
  store.views[idx] = {
    ...store.views[idx],
    name:      data.name      !== undefined ? String(data.name).trim()  : store.views[idx].name,
    isDefault: data.isDefault !== undefined ? data.isDefault === true    : store.views[idx].isDefault,
    filters:   Array.isArray(data.filters)  ? data.filters              : store.views[idx].filters,
    positions: data.positions !== undefined ? data.positions            : store.views[idx].positions,
    viewport:  data.viewport  !== undefined ? data.viewport             : store.views[idx].viewport,
    groups:    Array.isArray(data.groups)   ? data.groups               : (store.views[idx].groups || []),
    updatedAt: new Date().toISOString(),
  };
  await writeStore(store);
  return store.views[idx];
}

async function setDefaultView(campaignId, viewId) {
  const store = await readStore();
  let found = false;
  store.views.forEach(v => {
    if (v.campaignId === campaignId) {
      v.isDefault = v.id === viewId;
      if (v.id === viewId) found = true;
    }
  });
  if (!found) return null;
  await writeStore(store);
  return store.views.find(v => v.id === viewId) || null;
}

async function deleteView(viewId) {
  const store = await readStore();
  const before = store.views.length;
  store.views = store.views.filter(v => v.id !== viewId);
  if (store.views.length === before) return false;
  await writeStore(store);
  return true;
}

async function deleteViewsForCampaign(campaignId) {
  const store = await readStore();
  const before = store.views.length;
  store.views = store.views.filter(view => view.campaignId !== campaignId);
  if (store.views.length === before) return 0;
  await writeStore(store);
  return before - store.views.length;
}

module.exports = { getViewsForCampaign, createView, updateView, deleteView, deleteViewsForCampaign, setDefaultView };
