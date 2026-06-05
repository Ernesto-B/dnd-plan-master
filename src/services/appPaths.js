const path = require('path');

function isElectronRuntime() {
  return !!(process.versions && process.versions.electron);
}

function getElectronApp() {
  if (!isElectronRuntime()) return null;
  const { app } = require('electron');
  return app;
}

function getBundledDataDir() {
  return path.join(__dirname, '..', '..', 'data');
}

function getWritableDataDir() {
  const electronApp = getElectronApp();
  if (electronApp) {
    return path.join(electronApp.getPath('userData'), 'data');
  }

  return getBundledDataDir();
}

function getSeedFile(name) {
  return path.join(getBundledDataDir(), name);
}

function getDataFile(name) {
  return path.join(getWritableDataDir(), name);
}

module.exports = {
  getDataFile,
  getSeedFile,
  getWritableDataDir,
  isElectronRuntime,
};
