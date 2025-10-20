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
            mainContent.style.display = 'flex';
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
            // Debug: log incoming power data so we can see TRACKING_ACTIVE / TIME_ON_BATTERY
            console.debug('power-monitor incoming:', data);
            updatePowerInfo(data);
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

    let lastData = null; 

    function updatePowerInfo(data) {
        lastData = data;
        let currentLang = localStorage.getItem('language') || 'ru';

        elements.acStatus.textContent = data.AC_LINE_STATUS === 'Online' 
            ? translations[currentLang].acStatusOnline 
            : translations[currentLang].acStatusOffline;
            
        elements.batteryPercent.textContent = data.BATTERY_PERCENT;
        
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
});