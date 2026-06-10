const fs = require('fs').promises;
const path = require('path');
const { getDataFile, getWritableDataDir } = require('./appPaths');
const { migrateMapStore, STORE_SCHEMA_VERSION } = require('./schema');
const { readVersionedStore, writeVersionedStore } = require('./versionedStore');

const MAPS_FILE   = getDataFile('maps.json');
const MAPS_IMG_DIR = path.join(getWritableDataDir(), 'maps');

async function readStore() {
  return readVersionedStore(
    MAPS_FILE,
    () => ({ schemaVersion: STORE_SCHEMA_VERSION, maps: [] }),
    migrateMapStore,
  );
}

async function writeStore(store) {
  await writeVersionedStore(MAPS_FILE, migrateMapStore(store));
}

async function getMap(campaignId) {
  const store = await readStore();
  return store.maps.find(m => m.campaignId === campaignId) || null;
}

async function getAllMaps() {
  const store = await readStore();
  return store.maps;
}

async function saveMap(campaignId, data) {
  const store = await readStore();
  const idx   = store.maps.findIndex(m => m.campaignId === campaignId);
  const record = {
    campaignId,
    imageFilename: data.imageFilename ?? null,
    pins:         Array.isArray(data.pins) ? data.pins : [],
    updatedAt:    new Date().toISOString(),
  };
  if (idx >= 0) store.maps[idx] = record;
  else          store.maps.push(record);
  await writeStore(store);
  return record;
}

async function replaceAllMaps(maps) {
  await writeStore({ schemaVersion: STORE_SCHEMA_VERSION, maps: Array.isArray(maps) ? maps : [] });
}

async function saveMapImage(campaignId, buffer, ext) {
  await fs.mkdir(MAPS_IMG_DIR, { recursive: true });
  const filename = `map-${campaignId}${ext}`;
  await fs.writeFile(path.join(MAPS_IMG_DIR, filename), buffer);
  return filename;
}

function getMapImagePath(filename) {
  return path.join(MAPS_IMG_DIR, path.basename(String(filename || '')));
}

function getMapImageDir() {
  return MAPS_IMG_DIR;
}

// Remove a campaign's map entirely: delete the image file (if any) and drop the
// record (which holds all pins) from the store.
async function deleteMap(campaignId) {
  const store  = await readStore();
  const record = store.maps.find(m => m.campaignId === campaignId);
  if (record?.imageFilename) {
    try {
      await fs.unlink(getMapImagePath(record.imageFilename));
    } catch { /* file already gone — ignore */ }
  }
  store.maps = store.maps.filter(m => m.campaignId !== campaignId);
  await writeStore(store);
}

module.exports = {
  getMap,
  getAllMaps,
  saveMap,
  replaceAllMaps,
  saveMapImage,
  getMapImagePath,
  getMapImageDir,
  deleteMap,
};
