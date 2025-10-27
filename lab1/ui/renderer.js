document.addEventListener('DOMContentLoaded', () => {
    // Declare variables at the top
    let lastData = null;
    let monitoringStarted = false; // Flag to indicate if monitoring has started
    let lastPowerStatus = null; // Track the last power status to avoid unnecessary updates
    let lastBatteryPercent = null; // Track last battery percentage to avoid flickering
    let batteryPercentDisplayed = false; // Flag to track if a battery percentage has been displayed at least once
    let acStatusUpdateTimeout = null; // Timeout for AC status stabilization
    let batteryPercentUpdateTimeout = null; // Timeout for battery percentage stabilization
    let acStatusHistory = []; // Track recent AC status values to determine stable state
    const AC_STATUS_HISTORY_LENGTH = 5; // Number of recent values to consider (reduced for faster response)
    const AC_STATUS_STABLE_THRESHOLD = 3; // Number of similar values needed to consider stable (reduced for faster response)
    let lastAcStatusUpdate = null; // Track last processed AC status to avoid processing same value rapidly
    
    // --- Start Screen Logic ---
    const startBtn = document.getElementById('start-btn');
    const startScreen = document.getElementById('start-screen');
    const mainContent = document.getElementById('main-content');
    const videoBgNetwork = document.getElementById('video-bg-network');
    const videoBgBattery = document.getElementById('video-bg-battery');
    const videoBgIntro = document.getElementById('video-bg-intro');

    if (startBtn && startScreen && mainContent && videoBgNetwork && videoBgBattery && videoBgIntro) {
        videoBgIntro.play().catch(error => {
            console.error("Intro video autoplay failed:", error);
        });

        startBtn.addEventListener('click', () => {
            // Set the flag to indicate monitoring has started
            monitoringStarted = true;
            
            // Hide the intro video
            videoBgIntro.style.display = 'none';
            
            // Initially show the appropriate power-based video based on the latest received data
            if (lastData && lastData.AC_LINE_STATUS) {
                if (lastData.AC_LINE_STATUS === 'Online') {
                    // On AC power - show network video
                    videoBgNetwork.style.display = 'block';
                    videoBgBattery.style.display = 'none';
                    videoBgNetwork.play().catch(error => {
                        console.error("Network video play failed:", error);
                    });
                } else {
                    // On battery power - show battery video
                    videoBgNetwork.style.display = 'none';
                    videoBgBattery.style.display = 'block';
                    videoBgBattery.play().catch(error => {
                        console.error("Battery video play failed:", error);
                    });
                }
            } else {
                // Fallback: show network video by default
                videoBgNetwork.style.display = 'block';
                videoBgBattery.style.display = 'none';
                videoBgNetwork.play().catch(error => {
                    console.error("Network video play failed:", error);
                });
            }
            
            startScreen.style.display = 'none';
            mainContent.style.display = 'flex';
            // Video switching will now be handled in updatePowerInfo based on WebSocket data
        });
    } else {
        console.error('Start screen elements not found!');
    }

    // --- Поиск элементов ---
    const elements = {
        acStatus: document.getElementById('ac-status'),
        batteryPercent: document.getElementById('battery-percent'),
        batteryTime: document.getElementById('battery-time'),
        timeOnBattery: document.getElementById('time-on-battery'),
        saverMode: document.getElementById('saver-mode'),
        batteryInfo: document.getElementById('battery-info'),
        batteryChemistry: document.getElementById('battery-chemistry'),
        sleepBtn: document.getElementById('sleep-btn'),
        hibernateBtn: document.getElementById('hibernate-btn')
    };

    // --- Проверка наличия всех элементов ---
    for (const key in elements) {
        if (!elements[key]) {
            console.error(`UI element not found: #${key.replace(/([A-Z])/g, '-$1').toLowerCase()}`);
            return;
        }
    }

    // --- WebSocket ---
    const socket = new WebSocket('ws://localhost:3000');
    socket.onopen = () => { elements.acStatus.textContent = 'Подключено'; };
    socket.onerror = () => { elements.acStatus.textContent = "Ошибка соединения"; };
    socket.onclose = () => { elements.acStatus.textContent = "Соединение потеряно"; };

    socket.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            // Only update power info and switch videos after monitoring has started
            if (monitoringStarted) {
                updatePowerInfo(data);
            } else {
                // Store the initial data but don't switch videos yet
                // We'll use this data after the user clicks "Start Monitoring"
                lastData = data;
            }
        } catch (error) {
            console.error("Ошибка парсинга JSON:", error, "Получено:", event.data);
        }
    };

    // --- Кнопки управления ---
    elements.sleepBtn.addEventListener('click', () => sendPowerCommand('sleep'));
    elements.hibernateBtn.addEventListener('click', () => sendPowerCommand('hibernate'));

    function sendPowerCommand(action) {
        if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ action }));
        } else {
            alert('Не удается отправить команду: WebSocket не подключен.');
        }
    }

    // --- Обновление интерфейса ---
    function formatTime(secondsStr, lang = 'ru') {
        const seconds = parseInt(secondsStr, 10);
        if (isNaN(seconds) || seconds < 0) return translations[lang].batteryTimeCalculating;
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        if (lang === 'en') {
            return `${h} ${translations[lang].timeUnitHour} ${m} ${translations[lang].timeUnitMin}`;
        }
        return `${h} ${translations[lang].timeUnitHour} ${m} ${translations[lang].timeUnitMin}`;
    }
    
    function formatTimeWithSeconds(secondsStr, lang = 'ru') {
        const seconds = parseInt(secondsStr, 10);
        if (isNaN(seconds) || seconds < 0) return 'n/a';
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        if (lang === 'en') {
            return `${h} ${translations[lang].timeUnitHour} ${m} ${translations[lang].timeUnitMin} ${s} ${translations[lang].timeUnitSec}`;
        }
        return `${h} ${translations[lang].timeUnitHour} ${m} ${translations[lang].timeUnitMin} ${s} ${translations[lang].timeUnitSec}`;
    }

    function updatePowerInfo(data) {
        lastData = data;
        let currentLang = localStorage.getItem('language') || 'ru';

        // Update AC status - implement better stabilization
        // Add current status to history
        acStatusHistory.push(data.AC_LINE_STATUS);
        // Keep only the recent history
        if (acStatusHistory.length > AC_STATUS_HISTORY_LENGTH) {
            acStatusHistory.shift();
        }
        
        // Determine if we have a stable status to display
        let shouldUpdate = false;
        let stableStatus = null;
        
        // If this is the first time setting power status, use the current value
        if (lastPowerStatus === null) {
            stableStatus = data.AC_LINE_STATUS;
            shouldUpdate = true;
        } 
        // For subsequent checks, only update when there's a clear majority
        else {
            // Count occurrences of each status in the recent history
            const onlineCount = acStatusHistory.filter(status => status === 'Online').length;
            const offlineCount = acStatusHistory.filter(status => status === 'Offline').length;
            
            // Update only when we have clear majority (3 out of 5) in the new direction
            if (onlineCount >= AC_STATUS_STABLE_THRESHOLD && lastPowerStatus !== 'Online') {
                stableStatus = 'Online';
                shouldUpdate = true;
            } else if (offlineCount >= AC_STATUS_STABLE_THRESHOLD && lastPowerStatus !== 'Offline') {
                stableStatus = 'Offline';
                shouldUpdate = true;
            }
            // If no clear majority toward a different state, keep current status
            else {
                stableStatus = lastPowerStatus;
            }
        }
        
        // Only update if we've determined we should update
        if (shouldUpdate && lastPowerStatus !== stableStatus) {
            const newAcStatusText = stableStatus === 'Online' 
                ? translations[currentLang].acStatusOnline 
                : translations[currentLang].acStatusOffline;
            
            elements.acStatus.textContent = newAcStatusText;
            
            // Update the video background based on power status
            lastPowerStatus = stableStatus;
            if (stableStatus === 'Online') {
                // On AC power - show network video
                videoBgNetwork.style.display = 'block';
                videoBgBattery.style.display = 'none';
                videoBgNetwork.play().catch(error => {
                    console.error("Network video play failed:", error);
                });
            } else {
                // On battery power - show battery video
                videoBgNetwork.style.display = 'none';
                videoBgBattery.style.display = 'block';
                videoBgBattery.play().catch(error => {
                    console.error("Battery video play failed:", error);
                });
            }
        }
        
        // Handle battery percentage - show number once it appears, keep it until new number
        const batteryPercentValue = parseInt(data.BATTERY_PERCENT, 10);
        if (!isNaN(batteryPercentValue) && batteryPercentValue >= 0 && batteryPercentValue <= 100) {
            const newDisplayValue = batteryPercentValue + '%';
            
            // Update immediately if value has changed
            if (lastBatteryPercent !== batteryPercentValue) {
                // Clear any existing timeout
                if (batteryPercentUpdateTimeout) {
                    clearTimeout(batteryPercentUpdateTimeout);
                }
                
                // Update the display immediately with the new value
                elements.batteryPercent.textContent = newDisplayValue;
                // Update the stored last value
                lastBatteryPercent = batteryPercentValue;
                // Mark that a battery percentage has been displayed
                batteryPercentDisplayed = true;
            }
            // If the value hasn't changed, don't update (keep the existing display)
        } else {
            // If we can't parse the percentage, only update to '...' if no number has ever been displayed
            if (!batteryPercentDisplayed) {
                // If a number has never been displayed, show dots initially
                elements.batteryPercent.textContent = '...%';
            }
            // Once a number has been displayed, keep showing the last known number
            // even if subsequent data is unavailable
        }
        
        const saverMode = (data.SAVER_MODE || "").trim();
        elements.saverMode.textContent = saverMode === 'On' 
            ? translations[currentLang].saverModeOn 
            : translations[currentLang].saverModeOff;

        elements.batteryInfo.textContent = data.BATTERY_INFO.trim();
        
        const chemistry = (data.BATTERY_CHEMISTRY || "").trim();
        if (chemistry === "NoDevice" || chemistry === "Error") {
            elements.batteryChemistry.textContent = "Li-Ion";
        } else if (chemistry) {
            elements.batteryChemistry.textContent = chemistry;
        } else {
            elements.batteryChemistry.textContent = "Unknown";
        }

        if (data.AC_LINE_STATUS === 'Online') {
            elements.batteryTime.textContent = translations[currentLang].batteryTimeOnNet;
            elements.timeOnBattery.textContent = translations[currentLang].batteryTimeOnNet;
        } else {
            // Prefer elapsed (time since monitoring started / unplug) when available and valid.
            const elapsedRaw = (typeof data.ELAPSED_ON_BATTERY !== 'undefined') ? data.ELAPSED_ON_BATTERY : data.TIME_ON_BATTERY;
            const elapsedNum = parseInt(elapsedRaw, 10);

            // Prefer BATTERY_LIFE_TIME as the authoritative remaining time (per example)
            const batteryLifeRaw = (typeof data.BATTERY_LIFE_TIME !== 'undefined') ? data.BATTERY_LIFE_TIME : null;
            const batteryLifeNum = batteryLifeRaw !== null ? parseInt(batteryLifeRaw, 10) : NaN;

            if (batteryLifeRaw !== null) {
                // sentinel: (DWORD)-1 -> 4294967295 meaning unknown
                if (batteryLifeNum !== 4294967295 && Number.isFinite(batteryLifeNum) && batteryLifeNum >= 0) {
                    // OS provided a valid remaining time
                    elements.batteryTime.textContent = formatTime(batteryLifeNum, currentLang);
                } else {
                    // OS returned sentinel; try to use REMAINING_BATTERY_TIME (estimation or last known)
                    const remaining = (typeof data.REMAINING_BATTERY_TIME !== 'undefined') ? data.REMAINING_BATTERY_TIME : null;
                    const remainingNum = remaining !== null ? parseInt(remaining, 10) : NaN;
                    if (remaining !== null && Number.isFinite(remainingNum) && remainingNum >= 0) {
                        elements.batteryTime.textContent = formatTime(remainingNum, currentLang);
                    } else {
                        // still calculating / no estimate available
                        elements.batteryTime.textContent = translations[currentLang].batteryTimeCalculating;
                    }
                }
            } else {
                // fallback to REMAINING_BATTERY_TIME if provided
                const remaining = (typeof data.REMAINING_BATTERY_TIME !== 'undefined') ? data.REMAINING_BATTERY_TIME : null;
                const remainingNum = remaining !== null ? parseInt(remaining, 10) : NaN;
                if (remaining !== null && Number.isFinite(remainingNum) && remainingNum >= 0) {
                    elements.batteryTime.textContent = formatTime(remainingNum, currentLang);
                } else {
                    elements.batteryTime.textContent = translations[currentLang].batteryTimeCalculating;
                }
            }

            // Time on battery: prefer elapsed if present and non-negative; else show remaining; else calculating
            if (!isNaN(elapsedNum) && elapsedNum >= 0) {
                elements.timeOnBattery.textContent = formatTimeWithSeconds(elapsedNum, currentLang);
            } else if (batteryLifeRaw !== null) {
                // show battery life formatted or unknown (same as batteryTime above)
                if (batteryLifeNum === 4294967295 || isNaN(batteryLifeNum) || batteryLifeNum < 0) {
                    elements.timeOnBattery.textContent = translations[currentLang].batteryTimeUnknown;
                } else {
                    elements.timeOnBattery.textContent = formatTime(batteryLifeNum, currentLang);
                }
            } else if (typeof data.REMAINING_BATTERY_TIME !== 'undefined') {
                const remainingNum2 = parseInt(data.REMAINING_BATTERY_TIME, 10);
                if (Number.isFinite(remainingNum2)) elements.timeOnBattery.textContent = formatTime(remainingNum2, currentLang);
                else elements.timeOnBattery.textContent = translations[currentLang].batteryTimeCalculating;
            } else {
                elements.timeOnBattery.textContent = translations[currentLang].batteryTimeCalculating;
            }

            // debug suffix removed
        }
    }

    window.addEventListener('languageChange', (event) => {
        if(lastData) {
            updatePowerInfo(lastData);
        }
    });
    
    // Clean up timeouts when the page is unloaded
    window.addEventListener('beforeunload', () => {
        if (acStatusUpdateTimeout) {
            clearTimeout(acStatusUpdateTimeout);
        }
        if (batteryPercentUpdateTimeout) {
            clearTimeout(batteryPercentUpdateTimeout);
        }
    });
});