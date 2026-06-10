const fs = require('fs').promises;
const path = require('path');
const { getWritableDataDir } = require('./appPaths');

async function writeVersionedStore(filePath, store) {
  await fs.mkdir(getWritableDataDir(), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(store, null, 2), 'utf8');
}

async function readVersionedStore(filePath, createEmptyStore, migrate) {
  let rawText;
  try {
    rawText = await fs.readFile(filePath, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return createEmptyStore();
    throw err;
  }

  let parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch (err) {
    err.message = `Invalid JSON in ${path.basename(filePath)}: ${err.message}`;
    throw err;
  }

  const migrated = migrate(parsed);
  if (JSON.stringify(parsed) !== JSON.stringify(migrated)) {
    await writeVersionedStore(filePath, migrated);
  }
  return migrated;
}

module.exports = {
  readVersionedStore,
  writeVersionedStore,
};
