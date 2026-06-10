const fs = require('fs').promises;
const path = require('path');

const mapStore = require('./mapStore');

const MIME_BY_EXT = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

const EXT_BY_MIME = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

function normalizePins(pins) {
  return Array.isArray(pins) ? pins : [];
}

function normalizeRecord(record, campaignIdOverride) {
  const source = record && typeof record === 'object' ? record : {};
  const campaignId = String(campaignIdOverride || source.campaignId || '').trim();
  if (!campaignId) throw new Error('Map bundle is missing a campaignId');

  return {
    ...source,
    campaignId,
    imageFilename: source.imageFilename ? String(source.imageFilename) : null,
    pins: normalizePins(source.pins),
    updatedAt: source.updatedAt || null,
  };
}

function normalizeMimeType(mimeType, filename) {
  const fromMime = typeof mimeType === 'string' ? mimeType.trim().toLowerCase() : '';
  if (EXT_BY_MIME[fromMime]) return fromMime;

  const ext = path.extname(String(filename || '')).toLowerCase();
  return MIME_BY_EXT[ext] || null;
}

function normalizeExtension(filename, mimeType) {
  const fromMime = normalizeMimeType(mimeType, filename);
  if (fromMime) return EXT_BY_MIME[fromMime];

  const ext = path.extname(String(filename || '')).toLowerCase();
  return MIME_BY_EXT[ext] ? (ext === '.jpeg' ? '.jpg' : ext) : null;
}

function sanitizeToken(value, fallback) {
  const cleaned = String(value || '')
    .trim()
    .replace(/[^a-z0-9_-]+/gi, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned || fallback;
}

function buildImageFilename(campaignId, preferredFilename, mimeType) {
  const ext = normalizeExtension(preferredFilename, mimeType);
  if (!ext) throw new Error(`Unsupported map image type for campaign ${campaignId}`);
  return `map-${sanitizeToken(campaignId, 'default')}${ext}`;
}

function decodeBase64(base64, campaignId) {
  const normalized = String(base64 || '').replace(/\s+/g, '');
  if (!normalized) throw new Error(`Map image payload is empty for campaign ${campaignId}`);

  const buffer = Buffer.from(normalized, 'base64');
  if (!buffer.length) throw new Error(`Map image payload is invalid for campaign ${campaignId}`);

  const canonical = buffer.toString('base64').replace(/=+$/g, '');
  if (canonical !== normalized.replace(/=+$/g, '')) {
    throw new Error(`Map image payload is invalid for campaign ${campaignId}`);
  }

  return buffer;
}

async function readImageBundle(record) {
  if (!record.imageFilename) return null;

  const filePath = mapStore.getMapImagePath(record.imageFilename);
  const mimeType = normalizeMimeType(null, record.imageFilename);
  if (!mimeType) throw new Error(`Unsupported map image type for campaign ${record.campaignId}`);

  const buffer = await fs.readFile(filePath);
  return {
    filename: path.basename(record.imageFilename),
    mimeType,
    base64: buffer.toString('base64'),
  };
}

async function serializeCampaignMap(campaignId) {
  const record = await mapStore.getMap(campaignId);
  if (!record) return null;

  const normalized = normalizeRecord(record);
  return {
    ...normalized,
    image: await readImageBundle(normalized),
  };
}

async function serializeAllMaps() {
  const maps = await mapStore.getAllMaps();
  const bundles = [];
  for (const record of maps) {
    const normalized = normalizeRecord(record);
    bundles.push({
      ...normalized,
      image: await readImageBundle(normalized),
    });
  }
  return bundles;
}

async function ensureImageDir() {
  await fs.mkdir(mapStore.getMapImageDir(), { recursive: true });
}

async function writeImageBundle(campaignId, image, legacyFilename) {
  if (!image) {
    if (legacyFilename) {
      throw new Error(`Map image asset is missing for campaign ${campaignId}`);
    }
    return null;
  }

  if (typeof image !== 'object') {
    throw new Error(`Map image asset is invalid for campaign ${campaignId}`);
  }

  const filename = image.filename || legacyFilename || '';
  const mimeType = normalizeMimeType(image.mimeType, filename);
  if (!mimeType) throw new Error(`Unsupported map image type for campaign ${campaignId}`);

  const buffer = decodeBase64(image.base64, campaignId);
  const storedFilename = buildImageFilename(campaignId, filename, mimeType);

  await ensureImageDir();
  await fs.writeFile(path.join(mapStore.getMapImageDir(), storedFilename), buffer);
  return storedFilename;
}

async function removeImageFile(filename) {
  if (!filename) return;
  try {
    await fs.unlink(mapStore.getMapImagePath(filename));
  } catch {
    // Ignore already-missing files so restore/delete stays idempotent.
  }
}

function bundleToRecord(bundle, campaignIdOverride, imageFilename) {
  const normalized = normalizeRecord(bundle, campaignIdOverride);
  const { image, ...record } = normalized;
  return {
    ...record,
    imageFilename: imageFilename ?? null,
  };
}

async function restoreCampaignMap(bundle, campaignIdOverride) {
  if (!bundle) return null;

  const campaignId = String(campaignIdOverride || bundle.campaignId || '').trim();
  if (!campaignId) throw new Error('Target campaignId is required to restore a map');

  const existing = await mapStore.getMap(campaignId);
  const storedFilename = await writeImageBundle(campaignId, bundle.image, bundle.imageFilename);
  const nextRecord = bundleToRecord(bundle, campaignId, storedFilename);
  const maps = await mapStore.getAllMaps();
  const nextMaps = maps.filter(record => record.campaignId !== campaignId);
  nextMaps.push(nextRecord);
  await mapStore.replaceAllMaps(nextMaps);
  if (existing?.imageFilename && existing.imageFilename !== storedFilename) {
    await removeImageFile(existing.imageFilename);
  }
  return nextRecord;
}

async function replaceAllMapsFromBundles(bundles) {
  const items = Array.isArray(bundles) ? bundles : [];
  const byCampaignId = new Map();
  const files = [];

  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const campaignId = String(item.campaignId || '').trim();
    if (!campaignId) continue;

    const normalized = normalizeRecord(item, campaignId);
    let storedFilename = null;
    if (normalized.imageFilename || normalized.image) {
      const filename = (normalized.image && normalized.image.filename) || normalized.imageFilename;
      const mimeType = normalized.image && normalized.image.mimeType;
      storedFilename = buildImageFilename(campaignId, filename, mimeType);
      files.push({
        filename: storedFilename,
        buffer: decodeBase64(normalized.image && normalized.image.base64, campaignId),
      });
    }
    byCampaignId.set(campaignId, bundleToRecord(normalized, campaignId, storedFilename));
  }

  const finalDir = mapStore.getMapImageDir();
  const tempDir = `${finalDir}.tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await fs.mkdir(tempDir, { recursive: true });
  try {
    for (const file of files) {
      await fs.writeFile(path.join(tempDir, file.filename), file.buffer);
    }
    await fs.rm(finalDir, { recursive: true, force: true });
    await fs.rename(tempDir, finalDir);
  } catch (err) {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    throw err;
  }

  const records = Array.from(byCampaignId.values());
  await mapStore.replaceAllMaps(records);
  return records;
}

module.exports = {
  serializeCampaignMap,
  serializeAllMaps,
  restoreCampaignMap,
  replaceAllMapsFromBundles,
};
