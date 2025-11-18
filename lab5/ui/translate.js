// Переводы для интерфейса
const translations = {
    ru: {
        usbMonitor: "Мониторинг USB-портов",
        connectedDevices: "Подключенные устройства",
        removalEvents: "События извлечения",
        safeRemovalFailures: "Отказы безопасного извлечения",
        loadingDevices: "Загрузка устройств...",
        noEvents: "Нет событий",
        noFailures: "Нет отказов",
        noDevicesConnected: "Нет подключенных устройств",
        refresh: "Обновить",
        back: "Назад",
        timeUnitHour: "ч",
        timeUnitMin: "мин",
        timeUnitSec: "сек"
    },
    en: {
        usbMonitor: "USB Port Monitoring",
        connectedDevices: "Connected Devices",
        removalEvents: "Removal Events",
        safeRemovalFailures: "Safe Removal Failures",
        loadingDevices: "Loading devices...",
        noEvents: "No events",
        noFailures: "No failures",
        noDevicesConnected: "No connected devices",
        refresh: "Refresh",
        back: "Back",
        timeUnitHour: "hr",
        timeUnitMin: "min",
        timeUnitSec: "sec"
    }
};

// Установка языка по умолчанию
if (!localStorage.getItem('language')) {
    localStorage.setItem('language', 'ru');
}

// Функция для переключения языка
function toggleLanguage() {
    const currentLang = localStorage.getItem('language');
    const newLang = currentLang === 'ru' ? 'en' : 'ru';
    
    localStorage.setItem('language', newLang);
    
    // Обновление текста на странице
    updatePageLanguage(newLang);
    
    // Обновление текста кнопки
    document.querySelector('.lang-btn').textContent = newLang.toUpperCase();
    
    // Вызов события для других компонентов
    window.dispatchEvent(new CustomEvent('languageChange', { detail: { language: newLang } }));
}

// Функция для обновления текста на странице
function updatePageLanguage(lang) {
    const elements = document.querySelectorAll('[data-key]');
    elements.forEach(element => {
        const key = element.getAttribute('data-key');
        if (translations[lang] && translations[lang][key]) {
            element.textContent = translations[lang][key];
        }
    });
}

// Инициализация переключателя языка при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
    const langBtn = document.querySelector('.lang-btn');
    if (langBtn) {
        langBtn.textContent = (localStorage.getItem('language') || 'ru').toUpperCase();
        langBtn.addEventListener('click', toggleLanguage);
    }
    
    // Обновление языка на странице
    updatePageLanguage(localStorage.getItem('language') || 'ru');
});