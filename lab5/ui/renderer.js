// Get video elements
const introVideo = document.getElementById('introVideo');
const mainVideo = document.getElementById('mainVideo');
const connectVideo = document.getElementById('connectVideo');
const disconnectVideo = document.getElementById('disconnectVideo');
const safeVideo = document.getElementById('safeVideo');

// Get UI elements
const initialScreen = document.getElementById('initial-screen');
const mainApp = document.getElementById('main-app');
const startScanBtn = document.getElementById('start-scan-btn');

document.addEventListener('DOMContentLoaded', () => {
    // Show intro video by default on initial load and start playing it
    introVideo.style.display = 'block';
    mainVideo.style.display = 'none';
    connectVideo.style.display = 'none';
    disconnectVideo.style.display = 'none';
    safeVideo.style.display = 'none';

    // Start playing the intro video after a small delay to ensure DOM is ready
    setTimeout(() => {
        introVideo.play().catch(e => console.log("Intro video play failed (initial):", e));
    }, 100);

    // Declare variables
    let lastData = null;
    let eventsLog = [];
    let failuresLog = [];
    let previousDeviceCount = 0; // Track previous device count to detect changes

    // --- Поиск элементов ---
    const elements = {
        deviceList: document.getElementById('device-list'),
        eventsLog: document.getElementById('events-log'),
        failuresLog: document.getElementById('failures-log'),
        refreshBtn: document.getElementById('refresh-btn')
    };

    // --- Проверка наличия всех элементов ---
    for (const key in elements) {
        if (!elements[key]) {
            console.error(`UI element not found: #${key.replace(/([A-Z])/g, '-$1').toLowerCase()}`);
            return;
        }
    }

    // Add event listener for the start scan button
    if (startScanBtn) {
        startScanBtn.addEventListener('click', () => {
            // Hide initial screen and show main app
            initialScreen.style.display = 'none';
            mainApp.style.display = 'block';

            // Switch to main video background and start playing it
            switchVideo('main');

            // Reset the initialization flag so the next data update will set the baseline
            isInitialized = false;
        });
    }

    // Function to switch video backgrounds
    function switchVideo(videoType) {
        // Pause all videos initially
        introVideo.pause();
        mainVideo.pause();
        connectVideo.pause();
        disconnectVideo.pause();
        safeVideo.pause();

        // Hide all videos initially
        introVideo.style.display = 'none';
        mainVideo.style.display = 'none';
        connectVideo.style.display = 'none';
        disconnectVideo.style.display = 'none';
        safeVideo.style.display = 'none';

        // Show the requested video
        switch(videoType) {
            case 'intro':
                introVideo.style.display = 'block';
                // Start playing the intro video
                setTimeout(() => {
                    introVideo.play().catch(e => console.log("Intro video play failed:", e));
                }, 100); // Small delay to ensure display change takes effect
                break;
            case 'main':
                mainVideo.style.display = 'block';
                // Start playing the main video
                setTimeout(() => {
                    mainVideo.play().catch(e => console.log("Main video play failed:", e));
                }, 100); // Small delay to ensure display change takes effect
                break;
            case 'connect':
                connectVideo.style.display = 'block';
                // Start playing the connect video
                setTimeout(() => {
                    connectVideo.play().catch(e => console.log("Connect video play failed:", e));
                }, 100); // Small delay to ensure display change takes effect
                // After connect video finishes (3 seconds), return to main
                setTimeout(() => {
                    if (mainApp.style.display !== 'none' &&
                        connectVideo.style.display === 'block') {
                        switchVideo('main');
                    }
                }, 3000);
                break;
            case 'disconnect':
                disconnectVideo.style.display = 'block';
                // Start playing the disconnect video
                setTimeout(() => {
                    disconnectVideo.play().catch(e => console.log("Disconnect video play failed:", e));
                }, 100); // Small delay to ensure display change takes effect
                // After disconnect video finishes (3 seconds), return to main
                setTimeout(() => {
                    if (mainApp.style.display !== 'none' &&
                        disconnectVideo.style.display === 'block') {
                        switchVideo('main');
                    }
                }, 3000);
                break;
            case 'safe':
                safeVideo.style.display = 'block';
                // Start playing the safe removal video
                setTimeout(() => {
                    safeVideo.play().catch(e => console.log("Safe removal video play failed:", e));
                }, 100); // Small delay to ensure display change takes effect
                // After safe removal video finishes (3 seconds), return to main
                setTimeout(() => {
                    if (mainApp.style.display !== 'none' &&
                        safeVideo.style.display === 'block') {
                        switchVideo('main');
                    }
                }, 3000);
                break;
            default:
                mainVideo.style.display = 'block'; // Default to main video
                // Start playing the main video
                setTimeout(() => {
                    mainVideo.play().catch(e => console.log("Main video play failed:", e));
                }, 100); // Small delay to ensure display change takes effect
        }
    }

    // --- Electron IPC ---
    // Listen for USB data updates from main process
    window.electronAPI.onUSBDataUpdate((event, data) => {
        updateUSBInfo(data);
    });

    // --- Кнопки управления ---
    elements.refreshBtn.addEventListener('click', () => {
        // Force refresh by requesting fresh data from backend if needed
        // For now, just ensure the connection is working and will update automatically
    });

    // Function to update device list UI
    function updateDeviceList(devices) {
        const deviceListElement = elements.deviceList;
        deviceListElement.innerHTML = '';

        if (devices.length === 0) {
            const noDevices = document.createElement('p');
            noDevices.setAttribute('data-key', 'noDevicesConnected');

            // Update language based on stored preference
            const lang = localStorage.getItem('language') || 'ru';
            if (lang === 'en') {
                noDevices.textContent = translations[lang].noDevicesConnected || 'No devices connected';
            } else {
                noDevices.textContent = translations[lang].noDevicesConnected || 'Нет подключенных устройств';
            }
            deviceListElement.appendChild(noDevices);
            return;
        }

        devices.forEach(device => {
            const deviceItem = document.createElement('div');
            deviceItem.className = 'device-item safe-ejectable';

            const deviceInfo = document.createElement('div');

            // Determine device type
            let deviceType = 'Хранилище';
            if (device.isMountedAsCDROM) deviceType = 'CD-ROM';
            else if (device.isMountedAsFlash) deviceType = 'Флеш-накопитель';

            // Update language based on stored preference
            const lang = localStorage.getItem('language') || 'ru';
            if (lang === 'en') {
                deviceType = device.isMountedAsCDROM ? 'CD-ROM' : (device.isMountedAsFlash ? 'Flash drive' : 'Storage');
            }

            deviceInfo.innerHTML = `
                <strong>${device.friendlyName || 'Unknown device'}</strong><br>
                Drive letter: ${device.driveLetter}<br>
                Type: ${deviceType}<br>
                Safe to eject: ${device.isSafeToEject ? 'Yes' : 'No'}
            `;

            const ejectBtn = document.createElement('button');
            ejectBtn.className = 'eject-btn';

            if (lang === 'en') {
                ejectBtn.textContent = 'Safely remove';
            } else {
                ejectBtn.textContent = 'Безоп. извлечь';
            }

            ejectBtn.onclick = () => {
                // Only show safe removal video if the main app is displayed (after button click)
                if (mainApp.style.display !== 'none' && !isVideoPlaying) {
                    // Show safe removal video when attempting to safely eject a device
                    isVideoPlaying = true; // Set flag to prevent other video changes
                    switchVideo('safe');
                    // Reset to main video after delay
                    setTimeout(() => {
                        // Only switch to main if we're not showing connect/disconnect
                        if (document.getElementById('main-app').style.display !== 'none' &&
                            connectVideo.style.display !== 'block' &&
                            disconnectVideo.style.display !== 'block') {
                            switchVideo('main');
                        }
                        isVideoPlaying = false; // Reset flag after video completes
                    }, 3000); // Show safe video for 3 seconds
                }

                safeEjectDevice(device.driveLetter);
            };

            deviceItem.appendChild(deviceInfo);
            deviceItem.appendChild(ejectBtn);
            deviceListElement.appendChild(deviceItem);
        });
    }

    // Function to update events log
    function updateEventsLog(events) {
        const eventsLogElement = elements.eventsLog;
        eventsLogElement.innerHTML = '';

        if (!events || events.length === 0) {
            const noEvents = document.createElement('p');
            noEvents.setAttribute('data-key', 'noEvents');

            // Update language based on stored preference
            const lang = localStorage.getItem('language') || 'ru';
            if (lang === 'en') {
                noEvents.textContent = translations[lang].noEvents || 'No events';
            } else {
                noEvents.textContent = translations[lang].noEvents || 'Нет событий';
            }
            eventsLogElement.appendChild(noEvents);
            return;
        }

        // Show the last 10 events
        const recentEvents = events.slice(-10);
        recentEvents.forEach(event => {
            const eventElement = document.createElement('div');
            eventElement.className = `log-entry event-connected`;
            eventElement.textContent = event;
            eventsLogElement.appendChild(eventElement);
        });
    }

    // Function to update failures log
    function updateFailuresLog(failures) {
        const failuresLogElement = elements.failuresLog;
        failuresLogElement.innerHTML = '';

        if (!failures || failures.length === 0) {
            const noFailures = document.createElement('p');
            noFailures.setAttribute('data-key', 'noFailures');

            // Update language based on stored preference
            const lang = localStorage.getItem('language') || 'ru';
            if (lang === 'en') {
                noFailures.textContent = translations[lang].noFailures || 'No failures';
            } else {
                noFailures.textContent = translations[lang].noFailures || 'Нет отказов';
            }
            failuresLogElement.appendChild(noFailures);
            return;
        }

        // Show the last 10 failures
        const recentFailures = failures.slice(-10);
        recentFailures.forEach(failure => {
            const failureElement = document.createElement('div');
            failureElement.className = 'log-entry failure-event';
            failureElement.textContent = failure;
            failuresLogElement.appendChild(failureElement);
        });
    }

    // Flags to track if we've initialized and prevent video looping
    let isInitialized = false;
    let isVideoPlaying = false; // Track if a special video (connect/disconnect/safe) is currently playing
    let lastDeviceIds = new Set(); // Track unique identifiers of devices to detect actual changes
    let recentlyConnectedDevices = new Set(); // Track devices that recently triggered connection events
    let recentlyDisconnectedDevices = new Set(); // Track devices that recently triggered disconnection events

    // Function to get a unique identifier for a device
    function getDeviceId(device) {
        // Use the most stable identifier available
        return device.deviceInstanceId || device.driveLetter || device.devicePath || device.friendlyName || JSON.stringify(device);
    }

    // Function to handle USB information updates
    function updateUSBInfo(data) {
        // Update device list - this should always happen so the UI stays current
        if (data.usb_devices && Array.isArray(data.usb_devices)) {
            updateDeviceList(data.usb_devices);
        }

        // Update failures log - this should always happen
        if (data.safe_removal_failures && Array.isArray(data.safe_removal_failures)) {
            updateFailuresLog(data.safe_removal_failures);
        }

        // Update events log - this should always happen
        if (data.recent_events && Array.isArray(data.recent_events)) {
            updateEventsLog(data.recent_events);
        }

        // Update the interface based on current language - this should always happen
        updateLanguageContent();

        // Check if the main application is displayed (button has been clicked)
        const isMainAppDisplayed = mainApp.style.display !== 'none';

        // Create a set of current device IDs for comparison
        const currentDeviceIds = new Set();

        if (data.usb_devices && Array.isArray(data.usb_devices)) {
            for (const device of data.usb_devices) {
                const deviceId = getDeviceId(device);
                currentDeviceIds.add(deviceId);
            }
        }

        // Initialize the baseline after the first data update following button click
        if (!isInitialized) {
            lastDeviceIds = new Set(currentDeviceIds);
            isInitialized = true;
        }

        // Only change videos if the main app is displayed (after button click)
        if (isMainAppDisplayed) {
            // Only check for changes if no special video is currently playing
            if (!isVideoPlaying) {
                // Determine if devices were added or removed by comparing sets
                const lastIdsArray = Array.from(lastDeviceIds);
                const currentIdsArray = Array.from(currentDeviceIds);

                // Check for newly connected devices (excluding recently connected ones)
                const newDevices = currentIdsArray.filter(id => !lastDeviceIds.has(id) && !recentlyConnectedDevices.has(id));
                // Check for disconnected devices (excluding recently disconnected ones)
                const removedDevices = lastIdsArray.filter(id => !currentDeviceIds.has(id) && !recentlyDisconnectedDevices.has(id));

                if (newDevices.length > 0) {
                    // A device was connected
                    isVideoPlaying = true; // Set flag to prevent further video changes until this one completes

                    // Add newly connected devices to the recently connected set
                    newDevices.forEach(deviceId => recentlyConnectedDevices.add(deviceId));

                    switchVideo('connect');
                    // Reset to main after a delay
                    setTimeout(() => {
                        if (mainApp.style.display !== 'none') {
                            switchVideo('main');
                        }
                        isVideoPlaying = false; // Reset flag after video completes

                        // Clear the recently connected devices after video completes
                        setTimeout(() => {
                            newDevices.forEach(deviceId => recentlyConnectedDevices.delete(deviceId));
                        }, 4000); // Clear after 4 seconds to prevent re-triggering
                    }, 3000); // Show connect video for 3 seconds
                } else if (removedDevices.length > 0) {
                    // A device was disconnected
                    isVideoPlaying = true; // Set flag to prevent further video changes until this one completes

                    // Add newly disconnected devices to the recently disconnected set
                    removedDevices.forEach(deviceId => recentlyDisconnectedDevices.add(deviceId));

                    switchVideo('disconnect');
                    // Reset to main after a delay
                    setTimeout(() => {
                        if (mainApp.style.display !== 'none') {
                            switchVideo('main');
                        }
                        isVideoPlaying = false; // Reset flag after video completes

                        // Clear the recently disconnected devices after video completes
                        setTimeout(() => {
                            removedDevices.forEach(deviceId => recentlyDisconnectedDevices.delete(deviceId));
                        }, 4000); // Clear after 4 seconds to prevent re-triggering
                    }, 3000); // Show disconnect video for 3 seconds
                }
            }
        }
        // If main app is not displayed, do not change videos (stay on intro)

        // Update the last device IDs for next comparison
        lastDeviceIds = currentDeviceIds;
        lastData = data;
    }

    // Function to safely eject a device
    async function safeEjectDevice(devicePath) {
        try {
            const result = await window.electronAPI.sendSafeEjectCommand(devicePath);
            if (result.success) {
                console.log(`Safe eject command sent for: ${devicePath}`);
            } else {
                alert(`Error: ${result.message}`);
            }
        } catch (error) {
            console.error('Error sending safe eject command:', error);
            alert('Unable to send safe eject command.');
        }
    }

    // Function to update language-specific content
    function updateLanguageContent() {
        const lang = localStorage.getItem('language') || 'ru';

        // Update data-key attributes
        document.querySelectorAll('[data-key="connectedDevices"]').forEach(el => {
            el.textContent = translations[lang].connectedDevices;
        });
        document.querySelectorAll('[data-key="removalEvents"]').forEach(el => {
            el.textContent = translations[lang].removalEvents;
        });
        document.querySelectorAll('[data-key="safeRemovalFailures"]').forEach(el => {
            el.textContent = translations[lang].safeRemovalFailures;
        });
        document.querySelectorAll('[data-key="loadingDevices"]').forEach(el => {
            el.textContent = translations[lang].loadingDevices;
        });
        document.querySelectorAll('[data-key="noEvents"]').forEach(el => {
            el.textContent = translations[lang].noEvents;
        });
        document.querySelectorAll('[data-key="noFailures"]').forEach(el => {
            el.textContent = translations[lang].noFailures;
        });
        document.querySelectorAll('[data-key="refresh"]').forEach(el => {
            el.textContent = translations[lang].refresh;
        });
        document.querySelectorAll('[data-key="back"]').forEach(el => {
            el.textContent = translations[lang].back;
        });
        document.querySelectorAll('[data-key="usbMonitor"]').forEach(el => {
            el.textContent = translations[lang].usbMonitor;
        });

        // Update the start button text if it's in English mode
        if (startScanBtn) {
            if (lang === 'en') {
                startScanBtn.textContent = 'Start USB Scan';
            } else {
                startScanBtn.textContent = 'Начать сканирование USB';
            }
        }
    }

    // Initialize language content
    updateLanguageContent();

    // Listen for language change events
    window.addEventListener('languageChange', (event) => {
        if(lastData) {
            updateUSBInfo(lastData);
        }
    });
});