// Lab 6 - Bluetooth Device Monitor
let appSelectedDevice = null;
let selectedFile = null;
let selectedFileName = null;

// Function to set the background video
function setBackgroundVideo(videoSrc) {
    const backgroundVideo = document.getElementById('background-video');
    if (backgroundVideo) {
        // Update the source of the video
        const videoSource = backgroundVideo.querySelector('source');
        if (videoSource) {
            videoSource.src = videoSrc;
            // Reload the video element to play the new source
            backgroundVideo.load();
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // Initialize UI elements
    const startBtn = document.getElementById('start-btn');
    const startScreen = document.getElementById('start-screen');
    const mainContent = document.getElementById('main-content');

    // Start screen logic
    if (startBtn && startScreen && mainContent) {
        startBtn.addEventListener('click', () => {
            // Change background video to 6lab.mp4 when monitoring starts
            setBackgroundVideo('6lab.mp4');
            // Start Bluetooth monitoring and then show main content
            window.electronAPI.startBluetoothScan();
            startScreen.style.display = 'none';
            mainContent.style.display = 'block';
        });
    }

    // UI elements for the main content
    const selectFileBtn = document.getElementById('select-file-btn');
    const fileInput = document.getElementById('file-input');
    const playBtn = document.getElementById('play-btn');
    selectedFileName = document.getElementById('selected-file-name');

    // Bind event listeners
    selectFileBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', handleFileSelect);
    playBtn.addEventListener('click', playFile);

    // Bind to Electron API events
    window.electronAPI.onBluetoothDeviceFound((event, device) => {
        addDeviceToList(device, 'scanned');
    });

    window.electronAPI.onBluetoothScanStarted(() => {
        updateStatus('bluetooth-status', 'Bluetooth включен, сканирование запущено', 'connected');
    });

    window.electronAPI.onBluetoothScanStopped(() => {
        updateStatus('bluetooth-status', 'Bluetooth выключен, сканирование остановлено', 'disconnected');
    });

    window.electronAPI.onBluetoothConnected((event, device) => {
        appSelectedDevice = device;
        updateConnectionStatus(`Подключен к: ${device.name || device.id}`);
        // Move device from scanned to connected list
        moveDeviceToConnectedList(device);
        // Enable play button only if an audio file is selected
        if (selectedFile) {
            const fileExtension = selectedFile.name.toLowerCase().substring(selectedFile.name.lastIndexOf('.'));
            const audioExtensions = ['.mp3', '.wav', '.flac', '.aac', '.m4a', '.ogg', '.wma', '.m4p'];
            if (document.getElementById('play-btn') && audioExtensions.includes(fileExtension)) {
                document.getElementById('play-btn').disabled = false;
            }
        }
        // Also update the device selection dropdown to reflect the connected device
        updateDeviceSelectionDropdown();
    });

    window.electronAPI.onBluetoothDisconnected((event, deviceId) => {
        // Move device back to scanned list when disconnected
        moveDeviceToScannedList(deviceId);

        if (appSelectedDevice && appSelectedDevice.id === deviceId) {
            appSelectedDevice = null;
            updateConnectionStatus('Не подключено');
            if (document.getElementById('play-btn')) document.getElementById('play-btn').disabled = true;
            // Update device selection dropdown to remove the disconnected device if needed
            updateDeviceSelectionDropdown();
        }
    });

    window.electronAPI.onFileTransferProgress((event, progress) => {
        updateFileTransferProgress(progress);
    });

    window.electronAPI.onFileTransferComplete((event, result) => {
        hideProgress();

        let message = `Файл успешно передан: ${result.filePath}`;
        if (result.autoPlayed) {
            message += '\nАвтовоспроизведение включено на устройстве.';
        }
        alert(message);
    });

    window.electronAPI.onFileTransferError((event, error) => {
        hideProgress();
        alert(`Ошибка передачи файла: ${error}`);
    });


    // Get and display currently connected Windows Bluetooth devices
    refreshConnectedDevices();

    // Set up periodic refresh of connected devices to reflect real system state
    setInterval(() => {
        refreshConnectedDevices();
    }, 5000); // Refresh every 5 seconds

    // Set background video to intro initially
    setBackgroundVideo('6lab Intro.mp4');

    // Start scanning automatically when the page loads
    setTimeout(() => {
        startBluetoothScan();
    }, 1000); // Small delay to ensure UI is ready

    // Function to handle file selection - needs to be inside DOMContentLoaded to access UI vars
    function handleFileSelect(event) {
        const file = event.target.files[0];
        if (file) {
            selectedFile = file;
            selectedFileName.textContent = file.name;

            // Show device selection dropdown
            showDeviceSelection();
        }
    }
});

function startBluetoothScan() {
    window.electronAPI.startBluetoothScan();
}

function stopBluetoothScan() {
    window.electronAPI.stopBluetoothScan();
}

// Function to refresh and display currently connected Windows Bluetooth devices
function refreshConnectedDevices() {
    window.electronAPI.getConnectedDevices()
        .then(devices => {
            updateConnectedDevicesList(devices);
        })
        .catch(error => {
            console.error('Error getting connected devices:', error);
        });
}

// Function to update the connected devices list in the UI
function updateConnectedDevicesList(devices) {
    const connectedList = document.getElementById('connected-list');

    // Store previously selected device if any
    const previouslyAppSelectedDevice = appSelectedDevice;

    // Save current selection from device selection dropdown before updating
    const deviceSelect = document.getElementById('device-select');
    const currentSelection = deviceSelect ? deviceSelect.value : null;

    // Clear existing list completely
    connectedList.innerHTML = '';

    if (devices && devices.length > 0) {
        devices.forEach(device => {
            // For connected devices from Windows, ensure they have connected status
            if (!device.hasOwnProperty('connected')) {
                device.connected = true;
            }
            addDeviceToList(device, 'connected');
        });
    }

    // After updating connected devices, ensure the device selection dropdown
    // is updated to reflect only connected devices
    updateDeviceSelectionDropdown();

    // Restore selection if we had one and the device still exists
    if (deviceSelect && currentSelection) {
        // Check if the selected device still exists in the UI lists
        const connectedItems = connectedList.querySelectorAll('.device-item');
        const scannedList = document.getElementById('scanned-list');
        const scannedItems = scannedList.querySelectorAll('.device-item');

        // Check if the device exists in connected or scanned lists
        const deviceExists = [...connectedItems, ...scannedItems].some(
            item => item.dataset.deviceId === currentSelection
        );

        if (deviceExists) {
            deviceSelect.value = currentSelection;
        }
    }

    // Update the status panel to reflect number of connected devices
    updateConnectionStatus(devices && devices.length > 0
        ? `Подключено устройств: ${devices.length}`
        : 'Нет подключенных устройств');
}

// Function to sanitize device names in the renderer as well
function sanitizeDeviceNameForDisplay(name) {
    if (!name) return 'Unknown Device';

    // Remove special characters and non-English characters
    let sanitizedName = name.replace(/[^\x20-\x7E]/g, ''); // Keep only ASCII printable characters

    // Replace multiple spaces with single space
    sanitizedName = sanitizedName.replace(/\s+/g, ' ').trim();

    // If name contains specific device naming patterns (like in the terminal), preserve them
    // Check if name contains recognizable device names like in the terminal output
    const knownDevicePatterns = [
        /Mobicar/i,
        /DitooMic/i,
        /Buds(\d+)/i,
        /LYWSD/i,
        /QCY/i
    ];

    // If name matches a known device pattern, return it as-is (after basic sanitization)
    for (const pattern of knownDevicePatterns) {
        if (pattern.test(name)) {
            return sanitizedName;
        }
    }

    // Check if the name contains meaningful identifiers
    const nameParts = sanitizedName.split(/[\s\-_:]+/);
    for (let part of nameParts) {
        // If we find a part that looks like a meaningful device name (not generic), use it
        if (part.length >= 3 &&
            !part.toLowerCase().match(/(bluetooth|bt|device|unknown|mac|address|id)/) &&
            /^[a-zA-Z0-9]/.test(part)) { // Must start with alphanumeric
            // But if the full name contains more meaningful info, return that instead
            if (nameParts.length > 1 && sanitizedName.length > part.length * 2) {
                return sanitizedName; // Return the fuller name
            }
            return part;
        }
    }

    // If name becomes empty after sanitizing, return 'Unknown Device'
    if (!sanitizedName || sanitizedName.length < 2) {
        sanitizedName = 'Unknown Device';
    }

    return sanitizedName;
}

function addDeviceToList(device, type) {
    const listId = type === 'scanned' ? 'scanned-list' :
                  'connected-list';
    const list = document.getElementById(listId);

    // Check if device is already in the specific list to avoid duplicates
    const existingItem = list.querySelector(`.device-item[data-device-id="${device.id}"]`);
    if (existingItem) {
        // If device already exists in this specific list, just update its info
        existingItem.querySelector('.device-name').textContent = sanitizeDeviceNameForDisplay(device.name || device.displayName || device.id);
        existingItem.querySelector('.device-id').textContent = device.id;
        existingItem.querySelector('.device-info div:last-child').textContent = `Signal: ${device.rssi ? device.rssi + ' dBm' : 'N/A'}`;
        return;
    }

    const sanitizedName = sanitizeDeviceNameForDisplay(device.name || device.displayName || device.id);

    const deviceItem = document.createElement('li');
    deviceItem.className = 'device-item';
    deviceItem.dataset.deviceId = device.id;

    deviceItem.innerHTML = `
        <div class="device-info">
            <div class="device-name">${sanitizedName}</div>
            <div class="device-id">${device.id}</div>
            <div>Signal: ${device.rssi ? device.rssi + ' dBm' : 'N/A'}</div>
        </div>
    `;

    list.appendChild(deviceItem);
}

// Function to move a device to the connected list
function moveDeviceToConnectedList(device) {
    // Remove from any other list first
    removeDeviceFromAllLists(device.id);
    // Add to connected devices list
    addDeviceToList(device, 'connected');
}

// Function to move a device from connected list back to scanned list when disconnected
function moveDeviceToScannedList(deviceId) {
    // Find device in connected list and remove it
    const connectedList = document.getElementById('connected-list');
    const deviceItem = connectedList.querySelector(`.device-item[data-device-id="${deviceId}"]`);
    if (deviceItem) {
        // Get device info from the existing element
        const deviceName = deviceItem.querySelector('.device-name').textContent;
        const deviceRssi = deviceItem.querySelector('.device-info div:last-child').textContent.replace('Signal: ', '');

        // Remove from connected list
        deviceItem.remove();

        // Create a device object with the available info
        const device = {
            id: deviceId,
            name: deviceName,
            rssi: deviceRssi && deviceRssi !== 'N/A' ? parseInt(deviceRssi) : null
        };

        // Add back to scanned list
        addDeviceToList(device, 'scanned');
    }
}

// Function to show device selection dropdown
function showDeviceSelection() {
    // For audio playback, we can show all discovered devices (not just connected ones)
    // Get scanned devices to populate the dropdown
    const scannedList = document.getElementById('scanned-list');
    const scannedDevices = [];

    // Get all scanned devices from the UI
    const scannedItems = scannedList.querySelectorAll('.device-item');
    scannedItems.forEach(item => {
        const deviceId = item.dataset.deviceId;
        const deviceName = item.querySelector('.device-name').textContent;
        scannedDevices.push({
            id: deviceId,
            name: deviceName
        });
    });

    // Also add connected devices if any
    const connectedList = document.getElementById('connected-list');
    const connectedItems = connectedList.querySelectorAll('.device-item');
    connectedItems.forEach(item => {
        const deviceId = item.dataset.deviceId;
        const deviceName = item.querySelector('.device-name').textContent;
        // Avoid duplicates
        if (!scannedDevices.some(device => device.id === deviceId)) {
            scannedDevices.push({
                id: deviceId,
                name: deviceName
            });
        }
    });

    // Create device selection UI elements if they don't exist
    const transferControls = document.querySelector('.transfer-controls');
    let deviceSelect = document.getElementById('device-select');

    if (!deviceSelect) {
        // Create device selection dropdown
        const selectDiv = document.createElement('div');
        selectDiv.className = 'device-selection';
        selectDiv.innerHTML = `
            <label for="device-select">Выберите устройство:</label>
            <select id="device-select" class="device-select">
                <option value="">--Выберите устройство--</option>
            </select>
        `;
        transferControls.appendChild(selectDiv);
        deviceSelect = document.getElementById('device-select');

        // Add event listener for device selection
        deviceSelect.addEventListener('change', function() {
            const deviceId = this.value;
            if (deviceId) {
                // Update the UI to show play buttons
                const playBtn = document.getElementById('play-btn');

                // Enable play button only if an audio file is selected
                if (selectedFile) {
                    const fileExtension = selectedFile.name.toLowerCase().substring(selectedFile.name.lastIndexOf('.'));
                    const audioExtensions = ['.mp3', '.wav', '.flac', '.aac', '.m4a', '.ogg', '.wma', '.m4p'];
                    playBtn.disabled = !audioExtensions.includes(fileExtension);
                } else {
                    playBtn.disabled = true; // Disable if no file is selected
                }
            } else {
                const playBtn = document.getElementById('play-btn');
                playBtn.disabled = true;
            }
        });
    }

    // Save current selection before updating
    const currentSelection = deviceSelect.value;

    // Populate the dropdown with scanned and connected devices
    deviceSelect.innerHTML = '<option value="">--Выберите устройство--</option>';
    scannedDevices.forEach(device => {
        const option = document.createElement('option');
        const sanitizedName = sanitizeDeviceNameForDisplay(device.name || device.id);
        option.value = device.id;
        option.textContent = sanitizedName;
        deviceSelect.appendChild(option);
    });

    // Restore previous selection if the device still exists in the list
    if (currentSelection) {
        if (scannedDevices.some(device => device.id === currentSelection)) {
            deviceSelect.value = currentSelection;
        }
    }

    // If no devices available, still allow file selection for local playback
    if (scannedDevices.length === 0) {
        // Update buttons to allow local playback only
        const playBtn = document.getElementById('play-btn');
        if (selectedFile) {
            const fileExtension = selectedFile.name.toLowerCase().substring(selectedFile.name.lastIndexOf('.'));
            const audioExtensions = ['.mp3', '.wav', '.flac', '.aac', '.m4a', '.ogg', '.wma', '.m4p'];
            if (playBtn && audioExtensions.includes(fileExtension)) {
                playBtn.disabled = false;
            }
        }
    }
}

// Function to get the currently selected device from the dropdown
function getSelectedDeviceFromDropdown() {
    const deviceSelect = document.getElementById('device-select');
    if (deviceSelect && deviceSelect.value) {
        return deviceSelect.value;
    }
    return null;
}

// Function to update the device selection dropdown with available devices
function updateDeviceSelectionDropdown() {
    // Update device selection dropdown if it exists - with all discovered devices
    const deviceSelect = document.getElementById('device-select');
    if (deviceSelect) {
        // Save current selection before updating
        const currentSelection = deviceSelect.value;

        // Get currently scanned devices
        const scannedList = document.getElementById('scanned-list');
        const scannedDevices = [];

        // Get all scanned devices from the UI
        const scannedItems = scannedList.querySelectorAll('.device-item');
        scannedItems.forEach(item => {
            const deviceId = item.dataset.deviceId;
            const deviceName = item.querySelector('.device-name').textContent;
            scannedDevices.push({
                id: deviceId,
                name: deviceName
            });
        });

        // Also add connected devices if any
        const connectedList = document.getElementById('connected-list');
        const connectedItems = connectedList.querySelectorAll('.device-item');
        connectedItems.forEach(item => {
            const deviceId = item.dataset.deviceId;
            const deviceName = item.querySelector('.device-name').textContent;
            // Avoid duplicates
            if (!scannedDevices.some(device => device.id === deviceId)) {
                scannedDevices.push({
                    id: deviceId,
                    name: deviceName
                });
            }
        });

        // Repopulate dropdown with scanned and connected devices
        deviceSelect.innerHTML = '<option value="">--Выберите устройство--</option>';
        scannedDevices.forEach(device => {
            const option = document.createElement('option');
            const sanitizedName = sanitizeDeviceNameForDisplay(device.name || device.id);
            option.value = device.id;
            option.textContent = sanitizedName;
            deviceSelect.appendChild(option);
        });

        // Restore previous selection if the device still exists in the list
        if (currentSelection) {
            if (scannedDevices.some(device => device.id === currentSelection)) {
                deviceSelect.value = currentSelection;
            }
        }

        // Update buttons state based on the restored device selection
        const newDeviceId = deviceSelect.value;
        if (newDeviceId) {
            const playBtn = document.getElementById('play-btn');

            // Enable play button only if an audio file is selected
            if (selectedFile) {
                const fileExtension = selectedFile.name.toLowerCase().substring(selectedFile.name.lastIndexOf('.'));
                const audioExtensions = ['.mp3', '.wav', '.flac', '.aac', '.m4a', '.ogg', '.wma', '.m4p'];
                playBtn.disabled = !audioExtensions.includes(fileExtension);
            } else {
                playBtn.disabled = true; // Disable if no file is selected
            }
        } else {
            const playBtn = document.getElementById('play-btn');
            playBtn.disabled = true;
        }
    }
}

// Transfer file function - not used anymore due to interface simplification
function transferFile() {
    alert('Функция передачи файла больше не используется. Используйте воспроизведение напрямую.');
}

// Function to play selected file on current output device
function playFile() {
    // We don't need a specific device for this operation,
    // the system will use the current default audio output device
    let deviceId = 'current-output-device'; // Placeholder ID indicating current output device

    // We can still use the selected device from dropdown if available, just for reference
    const selectedDeviceFromDropdown = getSelectedDeviceFromDropdown();
    if (selectedDeviceFromDropdown) {
        deviceId = selectedDeviceFromDropdown;
    }

    if (!selectedFile) {
        alert('Сначала выберите файл для воспроизведения');
        return;
    }

    showProgress();

    // Use the file name since we don't have direct path access in renderer
    const fileName = selectedFile.name || '';

    // Get the full path through the main process instead of here
    const filePath = selectedFile.path || selectedFile.name; // In renderer, we might not have path

    // Set playback active flag
    isPlaybackActive = true;

    // Change background video to 6lab Play.mp4 when playback starts
    setBackgroundVideo('6lab Play.mp4');

    // Set the current playback file path
    currentPlaybackFilePath = filePath;

    // Play the file on the current output device
    window.electronAPI.playFile(deviceId, filePath)
        .then(() => {
            // When playback finishes (either normally or due to error), reset the active flag
            isPlaybackActive = false;
            currentPlaybackFilePath = null;
            // Change background video back to 6lab.mp4 after playback finishes
            setBackgroundVideo('6lab.mp4');
        })
        .catch(error => {
            console.error('Play error:', error);
            hideProgress();
            isPlaybackActive = false;
            currentPlaybackFilePath = null;
            // Change background video back to 6lab.mp4 after playback error
            setBackgroundVideo('6lab.mp4');
            alert(`Ошибка воспроизведения файла: ${error.message}`);
        });
}

// Function to remove a device from all lists
function removeDeviceFromAllLists(deviceId) {
    const lists = ['scanned-list', 'connected-list'];
    lists.forEach(listId => {
        const list = document.getElementById(listId);
        const deviceItem = list?.querySelector(`.device-item[data-device-id="${deviceId}"]`);
        if (deviceItem) {
            deviceItem.remove();
        }
    });
}




function handleFileSelect(event) {
    const file = event.target.files[0];
    if (file) {
        selectedFile = file;
        selectedFileName.textContent = file.name;

        // Enable the play button if the file is an audio file (regardless of device connection)
        const fileExtension = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));
        const audioExtensions = ['.mp3', '.wav', '.flac', '.aac', '.m4a', '.ogg', '.wma', '.m4p'];

        if (audioExtensions.includes(fileExtension)) {
            document.getElementById('play-btn').disabled = false;
        } else {
            document.getElementById('play-btn').disabled = true; // Disable if not audio file
        }
    }

    function transferFile() {
        if (!appSelectedDevice) {
            alert('Сначала подключитесь к устройству');
            return;
        }

        if (!selectedFile) {
            alert('Сначала выберите файл для передачи');
            return;
        }

        showProgress();

        // Create a File object with path information
        const filePath = selectedFile.path || selectedFile.name; // In renderer, we might not have path

        window.electronAPI.transferFile(appSelectedDevice.id, filePath)
            .catch(error => {
                console.error('Transfer error:', error);
                hideProgress();
                alert(`Ошибка передачи файла: ${error.message}`);
            });
    }

    // Function to handle file selection - defined inside DOMContentLoaded and made accessible globally
    function handleFileSelect(event) {
        const file = event.target.files[0];
        if (file) {
            selectedFile = file;
            selectedFileName.textContent = file.name;
            if (appSelectedDevice) {
                transferBtn.disabled = false;
            }
        }
    }

    // Make function available globally for HTML event handlers
    window.handleFileSelect = handleFileSelect;
};

// Variable to track if playback is currently active
let isPlaybackActive = false;
let currentPlaybackFilePath = null;


function updateStatus(elementId, message, statusClass) {
    const element = document.getElementById(elementId);
    if (element) {
        element.textContent = message;
        element.className = statusClass || '';
    }
}

function updateConnectionStatus(message) {
    updateStatus('connection-status', message, 'connected');
}


function updateFileTransferProgress(progress) {
    const progressFill = document.getElementById('progress-fill');
    const progressText = document.getElementById('progress-text');

    if (progressFill && progressText) {
        progressFill.style.width = `${progress.percent || 0}%`;
        progressText.textContent = `${Math.round(progress.percent || 0)}%`;
    }
}

function showProgress() {
    const progressContainer = document.getElementById('transfer-progress');
    if (progressContainer) {
        progressContainer.style.display = 'block';
    }
}

function hideProgress() {
    const progressContainer = document.getElementById('transfer-progress');
    if (progressContainer) {
        progressContainer.style.display = 'none';
    }
}

// Make functions available globally for inline event handlers
window.transferFile = transferFile;