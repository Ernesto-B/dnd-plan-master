const path = require('path');
const { app, BrowserWindow, shell, nativeImage, ipcMain } = require('electron');

const { startServer } = require('../src/server');
const backupScheduler = require('../src/services/backupScheduler');

let mainWindow = null;
let localServer = null;
let shuttingDownServer = null;
const appIconPath = path.join(__dirname, '..', 'assets', 'icons', 'icon.png');
const preloadPath = path.join(__dirname, 'preload.js');
app.setName('D&D Master');

function openExternalLinksFrom(webContents) {
  webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

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
      preload: preloadPath,
    },
  });

  openExternalLinksFrom(mainWindow.webContents);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Load the React SPA root (was the iframe shell). VITE_DEV_SERVER_URL lets a
  // developer point the desktop window at the Vite HMR server when iterating.
  await mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL || `${serverInfo.url}/`);
}

// Renderer pages (e.g. the Run Mode initiative tracker) ask for a real app
// window — rather than a browser tab — so the DM can drag it to a second
// monitor or TV and have it persist alongside the main window.
function serverOrigin() {
  return localServer ? localServer.url : '';
}

ipcMain.handle('open-shell-window', async () => {
  const serverInfo = await ensureServer();
  const win = new BrowserWindow({
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
      preload: preloadPath,
    },
  });
  openExternalLinksFrom(win.webContents);
  win.once('ready-to-show', () => win.show());
  win.on('closed', () => {});
  await win.loadURL(process.env.VITE_DEV_SERVER_URL || `${serverInfo.url}/`);
  return true;
});

ipcMain.handle('open-popout-window', async (event, url, options = {}) => {
  if (typeof url !== 'string' || !url.startsWith(serverOrigin())) return false;

  const popout = new BrowserWindow({
    width: options.width || 420,
    height: options.height || 640,
    minWidth: 320,
    minHeight: 320,
    backgroundColor: '#181411',
    icon: appIconPath,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      preload: preloadPath,
    },
  });

  openExternalLinksFrom(popout.webContents);
  await popout.loadURL(url);
  popout.show();
  return true;
});

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
