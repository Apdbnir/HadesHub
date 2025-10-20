// Preload can expose safe IPC helpers if required in future
const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {});
