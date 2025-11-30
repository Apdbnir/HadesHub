const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Bluetooth monitoring methods
  startBluetoothScan: () => ipcRenderer.invoke('start-bluetooth-scan'),
  stopBluetoothScan: () => ipcRenderer.invoke('stop-bluetooth-scan'),
  connectToDevice: (deviceId) => ipcRenderer.invoke('connect-to-device', deviceId),
  transferFile: (deviceId, filePath) => ipcRenderer.invoke('transfer-file', deviceId, filePath),
  playFile: (deviceId, filePath) => ipcRenderer.invoke('play-file', deviceId, filePath),
  getConnectedDevices: () => ipcRenderer.invoke('get-connected-devices'),
  disconnectFromDevice: (deviceId) => ipcRenderer.invoke('disconnect-from-device', deviceId),
  stopPlayback: (filePath) => ipcRenderer.invoke('stop-playback', filePath),
  
  // Event listeners
  onBluetoothDeviceFound: (callback) => ipcRenderer.on('bluetooth-device-found', callback),
  onBluetoothScanStarted: (callback) => ipcRenderer.on('bluetooth-scan-started', callback),
  onBluetoothScanStopped: (callback) => ipcRenderer.on('bluetooth-scan-stopped', callback),
  onBluetoothConnected: (callback) => ipcRenderer.on('bluetooth-connected', callback),
  onBluetoothDisconnected: (callback) => ipcRenderer.on('bluetooth-disconnected', callback),
  onFileTransferProgress: (callback) => ipcRenderer.on('file-transfer-progress', callback),
  onFileTransferComplete: (callback) => ipcRenderer.on('file-transfer-complete', callback),
  onFileTransferError: (callback) => ipcRenderer.on('file-transfer-error', callback)
});