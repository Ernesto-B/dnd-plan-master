const path = require('path');
const { app, BrowserWindow, shell, nativeImage } = require('electron');

const { startServer } = require('../src/server');
const backupScheduler = require('../src/services/backupScheduler');

let mainWindow = null;
let localServer = null;
let shuttingDownServer = null;
const appIconPath = path.join(__dirname, '..', 'assets', 'icons', 'icon.png');
app.setName('D&D Master');

async function ensureServer() {
  if (localServer) return localServer;
  localServer = await startServer({ port: 0 });
  return localServer;
}

async function createMainWindow() {
  const serverInfo = await ensureServer();

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1100,
    minHeight: 760,
    backgroundColor: '#181411',
    icon: appIconPath,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  await mainWindow.loadURL(serverInfo.url);
}

async function shutdownServer() {
  if (!localServer || !localServer.server) return;
  if (shuttingDownServer) {
    await shuttingDownServer;
    return;
  }

  shuttingDownServer = new Promise((resolve) => {
    localServer.server.close(() => resolve());
  });

  await shuttingDownServer;
  shuttingDownServer = null;
  localServer = null;
  backupScheduler.stop();
}

app.whenReady().then(async () => {
  try {
    if (process.platform === 'darwin') {
      app.dock.setIcon(nativeImage.createFromPath(appIconPath));
    }

    await createMainWindow();

    app.on('activate', async () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        await createMainWindow();
      }
    });
  } catch (err) {
    console.error('Failed to launch Electron app:', err);
    app.quit();
  }
});

app.on('window-all-closed', async () => {
  await shutdownServer();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', async () => {
  await shutdownServer();
});
