const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  getPowerStatus: () => ipcRenderer.send('get-power-status'),
  sleep: () => ipcRenderer.send('sleep'),
  hibernate: () => ipcRenderer.send('hibernate'),
  onUpdatePowerStatus: (callback) => ipcRenderer.on('power-status-updated', (_event, value) => callback(value))
});
