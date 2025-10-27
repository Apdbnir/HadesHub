// Translation dictionary
const translations = {
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
        startWebcamMonitoring: "Начать мониторинг камеры",
        timeUnitHour: "ч",
        timeUnitMin: "м",
        timeUnitSec: "с",
        batteryTimeCalculating: "расчет...",
        batteryTimeOnNet: "от питания",
        batteryTimeUnknown: "неизвестно",
        acStatusOnline: "От питания",
        acStatusOffline: "От батареи",
        saverModeOn: "Вкл",
        saverModeOff: "Выкл"
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
        startWebcamMonitoring: "Start Webcam Monitoring",
        timeUnitHour: "h",
        timeUnitMin: "m",
        timeUnitSec: "s",
        batteryTimeCalculating: "calculating...",
        batteryTimeOnNet: "on Power",
        batteryTimeUnknown: "unknown",
        acStatusOnline: "On Power",
        acStatusOffline: "On Battery",
        saverModeOn: "On",
        saverModeOff: "Off"
    }
};

// Function to translate elements with data-key attributes
function translateElements(lang = 'ru') {
    const elements = document.querySelectorAll('[data-key]');
    elements.forEach(element => {
        const key = element.getAttribute('data-key');
        if (translations[lang] && translations[lang][key]) {
            if (element.tagName === 'INPUT' && element.type === 'text') {
                element.placeholder = translations[lang][key];
            } else {
                element.textContent = translations[lang][key];
            }
        }
    });
}

// Initialize language based on localStorage or default to 'ru'
function initializeLanguage() {
    const savedLang = localStorage.getItem('language') || 'ru';
    translateElements(savedLang);
}

// Toggle between languages
function toggleLanguage() {
    const currentLang = localStorage.getItem('language') || 'ru';
    const newLang = currentLang === 'ru' ? 'en' : 'ru';
    localStorage.setItem('language', newLang);
    translateElements(newLang);
    
    // Dispatch a custom event to notify other parts of the application
    window.dispatchEvent(new CustomEvent('languageChange', { detail: { language: newLang } }));
}

// Set up the language toggle button
document.addEventListener('DOMContentLoaded', () => {
    const langBtn = document.querySelector('.lang-btn');
    if (langBtn) {
        langBtn.addEventListener('click', toggleLanguage);
        
        // Set initial language text
        const currentLang = localStorage.getItem('language') || 'ru';
        langBtn.textContent = currentLang === 'ru' ? 'EN' : 'RU';
        
        // Update button text when language changes
        window.addEventListener('languageChange', (event) => {
            const lang = localStorage.getItem('language') || 'ru';
            langBtn.textContent = lang === 'ru' ? 'EN' : 'RU';
        });
    }
    
    initializeLanguage();
});

// Expose translations to other scripts
window.translations = translations;