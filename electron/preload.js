const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('dndApp', {
  openPopoutWindow: (url, options) => ipcRenderer.invoke('open-popout-window', url, options),
  openShellWindow:  ()             => ipcRenderer.invoke('open-shell-window'),
});
