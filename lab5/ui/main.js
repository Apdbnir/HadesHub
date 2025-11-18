const { app, BrowserWindow, ipcMain } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

let mainWindow;
let usbMonitorProcess = null;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        },
        icon: path.join(__dirname, 'icon.png') // Use a proper icon if available
    });

    mainWindow.loadFile('index.html');
}

// Function to compile and start USB monitor
function startUSMonitor() {
    return new Promise((resolve, reject) => {
        const lab5Dir = path.join(__dirname, '..'); // lab5 directory
        const exePath = path.join(lab5Dir, 'usbmonitor.exe');
        const srcPath = path.join(lab5Dir, 'main.cpp');

        // Check if executable already exists
        if (fs.existsSync(exePath)) {
            console.log(`Starting existing executable: ${exePath}`);
            startProcess(exePath);
            resolve();
        } else if (fs.existsSync(srcPath)) {
            // Compile the source
            console.log('Compiling USB monitor...');

            // Try to compile with g++
            const gpp = spawn('g++', [
                'main.cpp',
                '-O2',
                '-std=c++17',
                '-o',
                'usbmonitor.exe',
                '-lsetupapi',
                '-lole32',
                '-loleaut32',
                '-lwbemuuid',
                '-ladvapi32'
            ], { cwd: lab5Dir });

            gpp.stdout.on('data', (data) => {
                console.log(`[g++] ${data}`);
            });

            gpp.stderr.on('data', (data) => {
                console.error(`[g++] ${data}`);
            });

            gpp.on('close', (code) => {
                if (code === 0 && fs.existsSync(exePath)) {
                    console.log('Compilation successful');
                    startProcess(exePath);
                    resolve();
                } else {
                    console.error('Compilation failed');
                    reject(new Error('Failed to compile USB monitor'));
                }
            });
        } else {
            reject(new Error('Source file not found'));
        }
    });
}

function startProcess(exePath) {
    // Kill any existing process
    if (usbMonitorProcess) {
        usbMonitorProcess.kill();
    }

    console.log(`Starting USB monitor: ${exePath}`);
    usbMonitorProcess = spawn(exePath, { cwd: path.dirname(exePath) });

    // Handle stdout (JSON data)
    usbMonitorProcess.stdout.on('data', (data) => {
        const output = data.toString();
        // Split by newlines in case multiple JSON objects are output
        const lines = output.split('\n').filter(line => line.trim() !== '');

        lines.forEach(line => {
            try {
                const jsonData = JSON.parse(line.trim());
                // Send to renderer
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('usb-data', jsonData);
                }
            } catch (e) {
                console.error('Error parsing JSON from USB monitor:', e, 'Line:', line);
            }
        });
    });

    // Handle stderr
    usbMonitorProcess.stderr.on('data', (data) => {
        console.error(`USB Monitor Error: ${data}`);
    });

    // Handle process exit
    usbMonitorProcess.on('close', (code) => {
        console.log(`USB Monitor process exited with code ${code}`);
        usbMonitorProcess = null;
    });

    // Handle process errors
    usbMonitorProcess.on('error', (err) => {
        console.error('Failed to start USB monitor process:', err);
        usbMonitorProcess = null;
    });
}

app.whenReady().then(async () => {
    createWindow();

    // Start USB monitor when app is ready
    try {
        await startUSMonitor();
        console.log('USB Monitor started successfully');
    } catch (error) {
        console.error('Failed to start USB Monitor:', error.message);
    }

    app.on('activate', function () {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

// Handle safe eject command from renderer
ipcMain.handle('safe-eject', (event, devicePath) => {
    if (usbMonitorProcess && usbMonitorProcess.stdin) {
        const command = `safe_eject: ${devicePath}`;
        usbMonitorProcess.stdin.write(command + '\n');
        return { success: true, message: `Command sent: ${command}` };
    }
    return { success: false, message: 'USB Monitor process not running' };
});

app.on('window-all-closed', function () {
    // Kill the USB monitor process when app closes
    if (usbMonitorProcess) {
        usbMonitorProcess.kill();
    }
    if (process.platform !== 'darwin') app.quit();
});