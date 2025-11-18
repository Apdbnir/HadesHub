const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  startLab: (labId) => ipcRenderer.invoke('start-lab', labId),

  // Lab 4 specific methods
  savePhoto: (imageData) => ipcRenderer.invoke('save-photo', imageData),
  capturePhoto: () => ipcRenderer.invoke('capture-photo'),
  toggleHiddenMode: () => ipcRenderer.invoke('toggle-hidden-mode'),
  showWarningOverlay: () => ipcRenderer.invoke('show-warning-overlay'),

  // Lab 5 specific methods
  sendSafeEjectCommand: (devicePath) => ipcRenderer.invoke('safe-eject', devicePath),

  // Event listeners for Lab 4
  onStartHiddenModeCapture: (callback) => ipcRenderer.on('start-hidden-mode-capture', callback),
  onCapturePhotoInHiddenMode: (callback) => ipcRenderer.on('capture-photo-in-hidden-mode', callback),
  onStopHiddenModeCapture: (callback) => ipcRenderer.on('stop-hidden-mode-capture', callback),
  onDisableHiddenMode: (callback) => ipcRenderer.on('disable-hidden-mode', callback),

  // Event listeners for Lab 5
  onUSBDataUpdate: (callback) => ipcRenderer.on('usb-data', callback)
});