const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { execFile } = require('child_process');

app.disableHardwareAcceleration();

const exePath = path.join(__dirname, '..', 'powermonitor.exe');

function createWindow () {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false // Allow loading local resources
    }
  });

  // Function to get and send power status
  const sendPowerStatus = () => {
    execFile(exePath, ['--status'], (error, stdout, stderr) => {
      console.log(`[${new Date().toLocaleTimeString()}] Running powermonitor.exe...`);
      if (error) {
        console.error(`EXEC ERROR: ${error.message}`);
        return;
      }
      if (stderr) {
        console.error(`STDERR: ${stderr}`);
      }
      console.log(`STDOUT: \n${stdout}`);
      win.webContents.send('power-status-updated', stdout);
    });
  };

  // Set up IPC listeners
  ipcMain.on('get-power-status', sendPowerStatus);
  ipcMain.on('sleep', () => execFile(exePath, ['--sleep']));
  ipcMain.on('hibernate', () => execFile(exePath, ['--hibernate']));

  // Periodically send power status
  setInterval(sendPowerStatus, 5000);

  win.loadFile('index.html');
  
  // Send initial status on load
  win.webContents.on('did-finish-load', sendPowerStatus);
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
