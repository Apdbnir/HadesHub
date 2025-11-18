const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
    // Camera control functions - these would be implemented in the main process
    capturePhoto: () => ipcRenderer.invoke('capture-photo'),
    startMonitoring: () => ipcRenderer.invoke('start-monitoring'),
    stopMonitoring: () => ipcRenderer.invoke('stop-monitoring'),
    toggleHiddenMode: () => ipcRenderer.invoke('toggle-hidden-mode'),
    savePhoto: (imageData) => ipcRenderer.invoke('save-photo', imageData),
    showWarningOverlay: () => ipcRenderer.invoke('show-warning-overlay'),
    disableHiddenMode: () => ipcRenderer.invoke('disable-hidden-mode'),

    // Status updates
    onStatusUpdate: (callback) => ipcRenderer.on('status-update', callback),
    removeStatusUpdateListener: () => ipcRenderer.removeAllListeners('status-update'),

    // System info
    getCameraInfo: () => ipcRenderer.invoke('get-camera-info'),

    // Hidden mode event listeners
    onStartHiddenModeCapture: (callback) => ipcRenderer.on('start-hidden-mode-capture', callback),
    onCapturePhotoInHiddenMode: (callback) => ipcRenderer.on('capture-photo-in-hidden-mode', callback),
    onStopHiddenModeCapture: (callback) => ipcRenderer.on('stop-hidden-mode-capture', callback),
    onDisableHiddenMode: (callback) => ipcRenderer.on('disable-hidden-mode', callback)
});