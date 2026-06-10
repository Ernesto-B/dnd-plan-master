const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const SERVICE_ROOT = path.join(PROJECT_ROOT, 'src');

function clearProjectModules() {
  for (const modulePath of Object.keys(require.cache)) {
    if (modulePath.startsWith(SERVICE_ROOT + path.sep)) {
      delete require.cache[modulePath];
    }
  }
}

function requireProject(relativePath) {
  return require(path.join(PROJECT_ROOT, relativePath));
}

async function withIsolatedDataDir(run) {
  const previousDataDir = process.env.DND_DATA_DIR;
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dnd-session-master-test-'));

  process.env.DND_DATA_DIR = dataDir;
  clearProjectModules();

  try {
    return await run({
      dataDir,
      projectRoot: PROJECT_ROOT,
      requireProject,
    });
  } finally {
    clearProjectModules();
    if (previousDataDir === undefined) delete process.env.DND_DATA_DIR;
    else process.env.DND_DATA_DIR = previousDataDir;
    await fs.rm(dataDir, { recursive: true, force: true });
  }
}

module.exports = {
  withIsolatedDataDir,
};
