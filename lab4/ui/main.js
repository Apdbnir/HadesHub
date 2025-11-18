const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');

let mainWindow;
let hiddenModeWindow = null;
let warningWindow = null;
let hiddenModeInterval = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    backgroundColor: '#000000', // Set a background color instead of transparent to ensure proper Windows frame rendering
    resizable: true, // Allow window to be resized
    maximizable: true, // Allow window to be maximized
    fullscreenable: true, // Allow window to be fullscreened
    frame: true, // Keep frame for normal window controls (maximize button)
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.loadFile('index.html');

  // Открыть DevTools для отладки
  // mainWindow.webContents.openDevTools();

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Enable fullscreen functionality
  mainWindow.on('enter-fullscreen', () => {
    console.log('Window entered fullscreen');
    mainWindow.setMenuBarVisibility(false); // Hide menu bar in fullscreen
    mainWindow.setKiosk(true); // Alternative way to ensure true fullscreen
  });

  mainWindow.on('leave-fullscreen', () => {
    console.log('Window left fullscreen');
    mainWindow.setMenuBarVisibility(true); // Show menu bar when not fullscreen
    mainWindow.setKiosk(false); // Disable kiosk mode
  });

  // Create menu with fullscreen option
  const menuTemplate = [
    {
      label: 'View',
      submenu: [
        {
          label: 'Toggle Fullscreen',
          accelerator: 'F11',
          click: () => {
            mainWindow.setFullScreen(!mainWindow.isFullScreen());
          }
        },
        {
          label: 'Toggle Developer Tools',
          accelerator: 'F12',
          click: () => {
            mainWindow.webContents.toggleDevTools();
          }
        },
        { type: 'separator' },
        {
          label: 'Actual Size',
          accelerator: 'CmdOrCtrl+0',
          click: () => {
            mainWindow.webContents.setZoomLevel(0);
          }
        },
        {
          label: 'Zoom In',
          accelerator: 'CmdOrCtrl+Plus',
          click: () => {
            const currentZoom = mainWindow.webContents.getZoomLevel();
            mainWindow.webContents.setZoomLevel(currentZoom + 0.5);
          }
        },
        {
          label: 'Zoom Out',
          accelerator: 'CmdOrCtrl+-',
          click: () => {
            const currentZoom = mainWindow.webContents.getZoomLevel();
            mainWindow.webContents.setZoomLevel(currentZoom - 0.5);
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(menuTemplate);
  Menu.setApplicationMenu(menu);
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Обработка IPC-запросов от renderer процесса
ipcMain.handle('capture-photo', async () => {
  console.log('Запрос на захват фото получен (через JS)');

  // For single photo capture, we need to have the renderer process handle this
  // since it has the active webcam stream
  // However, for actual implementation, we'll just return a message
  // since the renderer already handles photo capture with JS
  const takePhotoModule = require(path.join(__dirname, '..', 'take_photo.js'));

  // Create a timestamp-based filename for single capture
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `webcam_photo_${timestamp}.jpg`;
  const filepath = path.join(__dirname, '..', 'photos', filename);

  return `Ready to capture photo to: ${filepath} - actual capture handled by renderer`;
});

// New handler to save photos directly from renderer (using JavaScript)
ipcMain.handle('save-photo', async (event, imageData) => {
  console.log('save-photo handler called (used for both regular and hidden mode photos)');

  try {
    // Use the saveImageToFile function from take_photo.js
    const takePhotoModule = require(path.join(__dirname, '..', 'take_photo.js'));
    const filepath = await takePhotoModule.saveImageToFile(imageData, false); // false = not hidden mode

    console.log(`Photo successfully saved to: ${filepath}`);

    // Verify the file was created
    const fs = require('fs');
    if (fs.existsSync(filepath)) {
      console.log(`File verification: Photo file exists at ${filepath}`);
      const stats = fs.statSync(filepath);
      console.log(`File size: ${stats.size} bytes`);
    } else {
      console.error(`File verification: Photo file does not exist at ${filepath} after save attempt`);
    }

    return `Photo saved to: ${filepath}`;
  } catch (error) {
    console.error('Error saving photo:', error);
    console.error('Error stack:', error.stack);
    throw new Error(`Failed to save photo: ${error.message}`);
  }
});

ipcMain.handle('start-monitoring', async () => {
  // Логика запуска мониторинга
  console.log('Monitoring started');
  return 'Monitoring started';
});

ipcMain.handle('stop-monitoring', async () => {
  // Логика остановки мониторинга
  console.log('Monitoring stopped');
  return 'Monitoring stopped';
});

let hiddenModeActive = false;

ipcMain.handle('toggle-hidden-mode', async () => {
  if (!hiddenModeActive) {
    // Start hidden mode
    try {
      // For hidden mode capture, we'll use JavaScript capture as the primary method
      // First, send a message to the renderer to start periodic JS capture
      if (mainWindow && !mainWindow.isDestroyed()) {
        // For completely invisible operation, hide the window from taskbar and screen
        mainWindow.setSkipTaskbar(true); // Remove from taskbar
        mainWindow.hide(); // Hide the window completely

        // Send message to renderer to start hidden mode capture
        mainWindow.webContents.send('start-hidden-mode-capture');
      }

      // Use the JavaScript-only solution for periodic photo capture in hidden mode
      const takePhotoModule = require(path.join(__dirname, '..', 'take_photo.js'));
      const photosDir = require('path').join(__dirname, '..', 'photos');
      const { promises: fsPromises } = require('fs');

      // Ensure the photos directory exists
      await fsPromises.mkdir(photosDir, { recursive: true });
      console.log('Photos directory ensured for hidden mode:', photosDir);

      // Set up interval for JavaScript-based capture every 4 seconds
      // For hidden mode, we'll send a message to the renderer process to capture the photo
      // since it already has access to the active webcam stream
      hiddenModeInterval = setInterval(async () => {
        try {
          console.log('Hidden mode - sending capture request to renderer...');
          if (mainWindow && !mainWindow.isDestroyed()) {
            // Send a message to the renderer to capture a photo
            mainWindow.webContents.send('capture-photo-in-hidden-mode');
            console.log('Capture request sent to renderer process');
          }
        } catch (error) {
          console.error('Error sending capture request to renderer:', error);
        }
      }, 4000); // Every 4 seconds

      hiddenModeActive = true;
      console.log('Hidden mode activated with JavaScript capture');
      return 'Hidden mode activated with JavaScript capture';
    } catch (error) {
      console.error('Error starting hidden mode:', error);
      return 'Error starting hidden mode';
    }
  } else {
    // Stop hidden mode
    if (hiddenModeInterval) {
      clearInterval(hiddenModeInterval);
      hiddenModeInterval = null;
    }

    // Show the main window again
    if (mainWindow && !mainWindow.isDestroyed()) {
      // Restore original window size and bring back to visibility
      mainWindow.setSize(1200, 800); // Back to normal size
      mainWindow.setSkipTaskbar(false); // Add back to taskbar
      mainWindow.show(); // Show the window again

      // Restore window to original position (e.g., center of screen)
      const { screen } = require('electron');
      const primaryDisplay = screen.getPrimaryDisplay();
      const { width, height } = primaryDisplay.workArea;
      const windowWidth = 1200; // Default width
      const windowHeight = 800; // Default height
      const x = Math.floor(width / 2 - windowWidth / 2);
      const y = Math.floor(height / 2 - windowHeight / 2);
      mainWindow.setPosition(x, y);

      mainWindow.focus(); // Focus the window

      // Send message to renderer to stop hidden mode capture
      mainWindow.webContents.send('stop-hidden-mode-capture');
    }

    hiddenModeActive = false;
    console.log('Hidden mode deactivated');
    return 'Hidden mode deactivated';
  }
});

// Add handler for showing warning overlay
ipcMain.handle('show-warning-overlay', async () => {
  if (warningWindow && !warningWindow.isDestroyed()) {
    // If warning window already exists, just bring it to front
    warningWindow.focus();
    return 'Warning overlay already shown';
  }

  // Create warning overlay window
  warningWindow = new BrowserWindow({
    width: 700,
    height: 500,
    frame: false, // No window frame
    transparent: true, // Allow transparency
    alwaysOnTop: true, // Always stay on top
    resizable: false,
    skipTaskbar: true, // Don't show in taskbar
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: require('path').join(__dirname, 'preload.js')
    }
  });

  // Center the window on screen
  const { screen } = require('electron');
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workArea;
  const x = Math.floor(width / 2 - 600 / 2);
  const y = Math.floor(height / 2 - 400 / 2);
  warningWindow.setPosition(x, y);

  // Load a special HTML file for the warning overlay
  // For now, we'll create this functionality
  const overlayHtml = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <link href="https://fonts.googleapis.com/css2?family=Cinzel+Decorative:wght@700&family=Source+Sans+Pro:wght@300;400;600&display=swap" rel="stylesheet">
        <style>
          :root {
            --primary-color: #ff6a00;
            --glow-color: rgba(255, 106, 0, 0.7);
            --background-color: #000000;
            --surface-color: rgba(18, 18, 18, 0.5);
            --surface-border: rgba(255, 106, 0, 0.2);
            --text-color: #F5F5F5;
            --text-secondary-color: #A0A0A0;
            --font-title: 'Cinzel Decorative', cursive;
            --font-body: 'Cinzel Decorative', cursive;
          }

          body {
            margin: 0;
            padding: 0;
            background: transparent;
            font-family: var(--font-body);
            overflow: hidden;
            height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
          }
          .overlay-container {
            width: 90%;
            max-width: 650px;
            height: 85%;
            max-height: 450px;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            background: rgba(0, 0, 0, 0.8);
            color: var(--text-color);
            border-radius: 10px;
            padding: 25px;
            box-sizing: border-box;
          }
          .video-container {
            width: 100%;
            flex: 1;
            display: flex;
            justify-content: center;
            align-items: center;
            margin-bottom: 20px;
          }
          video {
            max-width: 100%;
            max-height: 100%;
            border-radius: 8px;
            object-fit: contain;
          }
          #disableHiddenBtn {
            font-family: var(--font-title) !important;
            font-weight: 600;
            font-size: 1rem;
            padding: 12px 30px !important;
            border: 2px solid var(--primary-color) !important;
            background: linear-gradient(45deg, transparent 50%, var(--primary-color) 50%) !important;
            background-size: 220% !important;
            background-position: 0% !important;
            color: var(--primary-color) !important;
            border-radius: 50px !important;
            cursor: pointer !important;
            transition: all 0.4s ease-in-out !important;
            text-transform: uppercase !important;
            text-decoration: none !important;
            display: inline-block !important;
            margin-top: 10px !important;
          }
          #disableHiddenBtn:hover {
            background-position: 100% !important;
            color: #fff !important;
            box-shadow: 0 0 20px var(--glow-color) !important;
          }
        </style>
      </head>
      <body>
        <div class="overlay-container">
          <div class="video-container">
            <video id="warningVideo" autoplay muted loop>
              <source src="file:///C:/VS%20Code/HadesHub/lab4/ui/4lab%20Warning.mp4" type="video/mp4">
              Your browser does not support the video tag.
            </video>
          </div>
          <button id="disableHiddenBtn" class="btn" data-lang-ru="Выключить скрытый режим" data-lang-en="Disable hidden mode">Disable hidden mode</button>
        </div>
        <script>
          // Function to update button text based on language preference
          function updateButtonText() {
            // Try to get language from localStorage, fallback to 'en' if not available
            let lang = 'en';
            try {
              // Attempt to communicate with main process to get current language
              if (window.electronAPI && typeof localStorage !== 'undefined') {
                lang = localStorage.getItem('lang') || 'en';
              } else {
                // If electronAPI is not available, try to detect from browser language
                lang = navigator.language.startsWith('ru') ? 'ru' : 'en';
              }
            } catch(e) {
              // If all else fails, default to English
              lang = 'en';
            }

            const button = document.getElementById('disableHiddenBtn');
            const ruText = button.getAttribute('data-lang-ru');
            const enText = button.getAttribute('data-lang-en');

            button.textContent = lang === 'ru' ? ruText : enText;
          }

          // Update button text on load
          updateButtonText();

          document.getElementById('disableHiddenBtn').addEventListener('click', () => {
            if (window.electronAPI) {
              window.electronAPI.disableHiddenMode().then(() => {
                window.close();
              }).catch(error => {
                console.error('Error disabling hidden mode:', error);
              });
            } else {
              console.error('electronAPI not available');
            }
          });
        </script>
      </body>
    </html>
  `;

  // Write the overlay HTML to a temporary file
  const overlayPath = require('path').join(__dirname, 'warning-overlay.html');
  require('fs').writeFileSync(overlayPath, overlayHtml);

  warningWindow.loadFile(overlayPath);

  // Clean up the temporary file when window is closed
  warningWindow.on('closed', () => {
    if (require('fs').existsSync(overlayPath)) {
      require('fs').unlinkSync(overlayPath);
    }
    warningWindow = null;
  });

  return 'Warning overlay shown';
});

// Add handler to disable hidden mode from the warning overlay
ipcMain.handle('disable-hidden-mode', async () => {
  if (hiddenModeInterval) {
    clearInterval(hiddenModeInterval);
    hiddenModeInterval = null;
  }

  // Show the main window again at its original position
  if (mainWindow && !mainWindow.isDestroyed()) {
    // Restore original window size and bring back to visibility
    mainWindow.setSize(1200, 800); // Back to normal size
    mainWindow.setSkipTaskbar(false); // Add back to taskbar
    mainWindow.show(); // Show the window again

    // Restore window to original position (e.g., center of screen)
    const { screen } = require('electron');
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.workArea;
    const windowWidth = 1200; // Default width
    const windowHeight = 800; // Default height
    const x = Math.floor(width / 2 - windowWidth / 2);
    const y = Math.floor(height / 2 - windowHeight / 2);
    mainWindow.setPosition(x, y);

    mainWindow.focus(); // Focus the window

    // Send message to renderer to stop hidden mode capture
    mainWindow.webContents.send('stop-hidden-mode-capture');

    // Also send a specific message to update the UI when hidden mode is disabled
    mainWindow.webContents.send('disable-hidden-mode');
  }

  hiddenModeActive = false;

  // Close the warning window
  if (warningWindow && !warningWindow.isDestroyed()) {
    warningWindow.close();
  }

  return 'Hidden mode deactivated';
});

// Add handler to save photo from JavaScript capture
ipcMain.handle('save-js-photo', async (event, imageData) => {
  console.log('save-js-photo handler called');
  const { promises: fsPromises } = require('fs');
  const path = require('path');

  try {
    // Use the saveImageToFile function from take_photo.js
    const takePhotoModule = require(path.join(__dirname, '..', 'take_photo.js'));
    const filepath = await takePhotoModule.saveImageToFile(imageData, true); // true = hidden mode

    console.log(`Hidden mode photo successfully saved to: ${filepath}`);
    return `Hidden mode photo saved to: ${filepath}`;
  } catch (error) {
    console.error('Error saving hidden mode photo:', error);
    throw new Error(`Failed to save hidden mode photo: ${error.message}`);
  }
});


ipcMain.handle('get-camera-info', async () => {
  return new Promise((resolve, reject) => {
    // Путь к исполняемому файлу C++
    const cppExePath = path.join(__dirname, '..', 'main.exe');

    // Запускаем C++ приложение для получения информации о камерах
    const child = spawn(cppExePath, ['info'], { cwd: path.dirname(cppExePath) });

    let output = '';
    let errorOutput = '';

    child.stdout.on('data', (data) => {
      output += data.toString();
    });

    child.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve(output);
      } else {
        resolve(`Error getting camera info: ${errorOutput || 'Unknown error'}`);
      }
    });

    child.on('error', (err) => {
      reject(new Error(`Failed to get camera info: ${err.message}`));
    });
  });
});