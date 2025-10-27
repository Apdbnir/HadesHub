document.addEventListener('DOMContentLoaded', () => {
    // --- Start Screen Logic ---
    const startBtn = document.getElementById('start-btn');
    const startScreen = document.getElementById('start-screen');
    const mainContent = document.getElementById('main-content');
    const videoBg = document.getElementById('video-bg');
    const videoBgMain = document.getElementById('video-bg-main');

    if (startBtn && startScreen && mainContent && videoBg && videoBgMain) {
        videoBg.play().catch(error => {
            console.error("Video autoplay failed:", error);
        });

        startBtn.addEventListener('click', () => {
            startScreen.style.display = 'none';
            videoBg.style.display = 'none';
            videoBgMain.style.display = 'block';
            videoBgMain.play().catch(error => {
                console.error("Main video autoplay failed:", error);
            });
            mainContent.style.display = 'block';
            
            // Initialize all functionality
            initializeWebcamMonitoring();
        });
    } else {
        console.error('Start screen elements not found!');
    }

    // --- Get UI elements ---
    const elements = {
        webcamStatus: document.getElementById('webcam-status'),
        webcamInfo: document.getElementById('webcam-info'),
        recordingStatus: document.getElementById('recording-status'),
        hiddenMode: document.getElementById('hidden-mode'),
        webcamPreview: document.getElementById('webcam-preview'),
        capturePhotoBtn: document.getElementById('capture-photo-btn'),
        startRecordingBtn: document.getElementById('start-recording-btn'),
        stopRecordingBtn: document.getElementById('stop-recording-btn'),
        toggleHiddenBtn: document.getElementById('toggle-hidden-btn')
    };

    // --- Validate elements ---
    for (const key in elements) {
        if (!elements[key]) {
            console.error(`UI element not found: #${key.replace(/([A-Z])/g, '-$1').toLowerCase()}`);
        }
    }

    // --- Webcam monitoring data ---
    let webcamData = {
        webcam_active: false,
        webcam_info: "Webcam not accessible",
        recording: false,
        hidden_mode: false,
        mediaStream: null
    };

    // Initialize webcam monitoring functionality
    async function initializeWebcamMonitoring() {
        // Set up button event listeners
        setupButtonListeners();
        
        // Start periodic status updates from backend
        startStatusUpdates();
    }

    // Function to get webcam status from backend
    async function getWebcamStatus() {
        try {
            // Check if we're in Electron environment
            if (window.electronAPI) {
                // In Electron, we could use IPC to communicate with backend
                // For now, we'll use fetch to read the status file
                const response = await fetch('webcam_status.json');
                if (response.ok) {
                    return await response.json();
                }
            } else {
                // For browser testing, return mock data
                return {
                    webcam_info: "Mock Camera | Resolution: 1920x1080 | Format: MJPEG",
                    webcam_active: true,
                    recording: false,
                    hidden_mode: false
                };
            }
        } catch (err) {
            console.error("Error fetching webcam status:", err);
            // Return mock data if file not found
            return {
                webcam_info: "No status file found - backend may not be running",
                webcam_active: false,
                recording: false,
                hidden_mode: false
            };
        }
    }

    // Set up button event listeners
    function setupButtonListeners() {
        // Photo capture functionality
        if (elements.capturePhotoBtn) {
            elements.capturePhotoBtn.addEventListener('click', capturePhoto);
        }
        
        // Video recording functionality
        if (elements.startRecordingBtn) {
            elements.startRecordingBtn.addEventListener('click', startVideoRecording);
        }
        
        if (elements.stopRecordingBtn) {
            elements.stopRecordingBtn.addEventListener('click', stopVideoRecording);
        }
        
        // Hidden mode toggle
        if (elements.toggleHiddenBtn) {
            elements.toggleHiddenBtn.addEventListener('click', toggleHiddenMode);
        }
    }

    // Start periodic status updates
    async function startStatusUpdates() {
        // Initial status update
        await updateStatusFromBackend();
        
        // Update status every 2 seconds
        setInterval(async () => {
            await updateStatusFromBackend();
        }, 2000);
    }

    // Send command to backend by creating command file
    async function sendCommandToBackend(command) {
        try {
            // The backend application monitors for command files
            // In a real Electron environment, we'd use IPC or file system APIs
            // For this demo, we'll show a message about the command being sent
            console.log(`Command sent to backend: ${command}`);
            
            // Create a command file that the backend can read
            if (window.electronAPI) {
                // In Electron, we could use IPC to write the command file
                // ipcRenderer.send('send-command', command);
            } else {
                // For browser testing, show a message
                let message = '';
                switch(command) {
                    case 'capture_photo':
                        message = 'Capture photo command sent';
                        break;
                    case 'start_video':
                        message = 'Start video recording command sent';
                        break;
                    case 'stop_video':
                        message = 'Stop video recording command sent';
                        break;
                    case 'toggle_hidden':
                        message = 'Toggle hidden mode command sent';
                        break;
                }
                console.log(message);
                alert(message + '\nMake sure the C++ backend application is running.');
            }
        } catch (err) {
            console.error("Error sending command to backend:", err);
            alert("Error communicating with backend. Make sure the C++ application is running.");
        }
    }

    // Update status from backend
    async function updateStatusFromBackend() {
        try {
            // Try to fetch the status file from the backend
            // Since this is running in Electron, we can access local files
            const response = await fetch('./webcam_status.json?t=' + new Date().getTime());
            if (response.ok) {
                const data = await response.json();
                webcamData = {...webcamData, ...data}; // Update webcamData with new values
                updateWebcamInfo(webcamData);
            } else {
                // If status file doesn't exist, show a warning
                webcamData.webcam_info = "Backend not running - status file not found";
                webcamData.webcam_active = false;
                webcamData.recording = false;
                webcamData.hidden_mode = false;
                updateWebcamInfo(webcamData);
            }
        } catch (err) {
            // If there's an error (like the file doesn't exist), show a warning
            webcamData.webcam_info = "Error fetching status from backend. Ensure the C++ application is running.";
            webcamData.webcam_active = false;
            updateWebcamInfo(webcamData);
        }
    }

    // Capture photo functionality
    async function capturePhoto() {
        await sendCommandToBackend('capture_photo');
    }

    // Video recording functionality
    async function startVideoRecording() {
        await sendCommandToBackend('start_video');
    }

    async function stopVideoRecording() {
        await sendCommandToBackend('stop_video');
    }

    // Toggle hidden mode functionality
    async function toggleHiddenMode() {
        await sendCommandToBackend('toggle_hidden');
    }

    // Update UI with webcam information
    function updateWebcamInfo(data) {
        // Update webcam status
        if (elements.webcamStatus && data.webcam_active !== undefined) {
            elements.webcamStatus.textContent = data.webcam_active ? 
                translations[getCurrentLanguage()].webcamActive : 
                translations[getCurrentLanguage()].webcamInactive;
        }

        // Update webcam info
        if (elements.webcamInfo && data.webcam_info) {
            elements.webcamInfo.textContent = data.webcam_info;
        }

        // Update recording status
        if (elements.recordingStatus && data.recording !== undefined) {
            elements.recordingStatus.textContent = data.recording ? 
                translations[getCurrentLanguage()].recordingActive : 
                translations[getCurrentLanguage()].recordingInactive;
        }

        // Update hidden mode status
        if (elements.hiddenMode && data.hidden_mode !== undefined) {
            elements.hiddenMode.textContent = data.hidden_mode ? 
                translations[getCurrentLanguage()].hiddenModeOn : 
                translations[getCurrentLanguage()].hiddenModeOff;
        }

        // Show alert if webcam is active (to warn user about surveillance)
        if (data.webcam_active) {
            showWebcamAlert();
        } else {
            hideWebcamAlert();
        }
    }

    // Show webcam alert
    function showWebcamAlert() {
        let alertEl = document.getElementById('webcam-alert');
        if (!alertEl) {
            alertEl = document.createElement('div');
            alertEl.id = 'webcam-alert';
            alertEl.innerHTML = `
                <h2>ПРЕДУПРЕЖДЕНИЕ</h2>
                <p>Обнаружена активность камеры!</p>
                <p>За вами могут наблюдать</p>
            `;
            alertEl.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                background: #ff4444;
                color: white;
                padding: 15px;
                border-radius: 5px;
                z-index: 10000;
                display: none;
                box-shadow: 0 4px 8px rgba(0,0,0,0.3);
            `;
            document.body.appendChild(alertEl);
        }
        alertEl.style.display = 'block';
    }

    // Hide webcam alert
    function hideWebcamAlert() {
        const alertEl = document.getElementById('webcam-alert');
        if (alertEl) {
            alertEl.style.display = 'none';
        }
    }

    // Store last data for language changes
    let lastData = null;

    window.addEventListener('languageChange', (event) => {
        if (lastData) {
            updateWebcamInfo(lastData);
        }
    });
});

// Translation object (will be overwritten by translate.js)
let translations = {
    ru: {
        webcamActive: "Активна",
        webcamInactive: "Неактивна",
        recordingActive: "Запись идёт",
        recordingInactive: "Не записывается",
        hiddenModeOn: "Включён",
        hiddenModeOff: "Выключен",
        webcamMonitor: "Мониторинг камеры",
        webcamStatus: "Статус камеры",
        webcamInfo: "Информация о камере",
        recordingStatus: "Статус записи",
        hiddenMode: "Скрытый режим",
        preview: "Предпросмотр",
        capturePhoto: "Сделать фото",
        startRecording: "Начать запись",
        stopRecording: "Остановить запись",
        toggleHidden: "Переключить скрытый режим",
        back: "Назад",
        startWebcamMonitoring: "Начать мониторинг камеры"
    },
    en: {
        webcamActive: "Active",
        webcamInactive: "Inactive",
        recordingActive: "Recording",
        recordingInactive: "Not recording",
        hiddenModeOn: "On",
        hiddenModeOff: "Off",
        webcamMonitor: "Webcam Monitor",
        webcamStatus: "Webcam Status",
        webcamInfo: "Webcam Info",
        recordingStatus: "Recording Status",
        hiddenMode: "Hidden Mode",
        preview: "Preview",
        capturePhoto: "Capture Photo",
        startRecording: "Start Recording",
        stopRecording: "Stop Recording",
        toggleHidden: "Toggle Hidden Mode",
        back: "Back",
        startWebcamMonitoring: "Start Webcam Monitoring"
    }
};

function getCurrentLanguage() {
    return localStorage.getItem('language') || 'ru';
}