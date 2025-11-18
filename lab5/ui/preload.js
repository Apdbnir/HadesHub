// preload.js
const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
    // Methods for USB monitoring
    sendSafeEjectCommand: (devicePath) => ipcRenderer.invoke('safe-eject', devicePath),

    // Listen for USB data updates
    onUSBDataUpdate: (callback) => ipcRenderer.on('usb-data', callback),

    // Remove the old listener since we're using the new event name
    removeUSBDataListener: () => ipcRenderer.removeAllListeners('usb-data'),

    // Other API methods can be added here
});