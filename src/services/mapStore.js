const fs = require('fs').promises;
const path = require('path');
const { getDataFile, getWritableDataDir } = require('./appPaths');

const MAPS_FILE   = getDataFile('maps.json');
const MAPS_IMG_DIR = path.join(getWritableDataDir(), 'maps');

async function readStore() {
  try {
    return JSON.parse(await fs.readFile(MAPS_FILE, 'utf8'));
  } catch {
    return { maps: [] };
  }
}

async function writeStore(store) {
  await fs.mkdir(getWritableDataDir(), { recursive: true });
  await fs.writeFile(MAPS_FILE, JSON.stringify(store, null, 2), 'utf8');
}

async function getMap(campaignId) {
  const store = await readStore();
  return store.maps.find(m => m.campaignId === campaignId) || null;
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

async function saveMapImage(campaignId, buffer, ext) {
  await fs.mkdir(MAPS_IMG_DIR, { recursive: true });
  const filename = `map-${campaignId}${ext}`;
  await fs.writeFile(path.join(MAPS_IMG_DIR, filename), buffer);
  return filename;
}

function getMapImagePath(filename) {
  return path.join(MAPS_IMG_DIR, filename);
}

// Remove a campaign's map entirely: delete the image file (if any) and drop the
// record (which holds all pins) from the store.
async function deleteMap(campaignId) {
  const store  = await readStore();
  const record = store.maps.find(m => m.campaignId === campaignId);
  if (record?.imageFilename) {
    try {
      await fs.unlink(path.join(MAPS_IMG_DIR, record.imageFilename));
    } catch { /* file already gone — ignore */ }
  }
  store.maps = store.maps.filter(m => m.campaignId !== campaignId);
  await writeStore(store);
}

module.exports = { getMap, saveMap, saveMapImage, getMapImagePath, deleteMap };
