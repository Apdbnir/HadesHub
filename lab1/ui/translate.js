const translations = {
    en: {
        startMonitoring: "Start Monitoring",
        powerMonitor: "Power Monitor",
        networkStatus: "Network Status",
        batteryCharge: "Battery Charge",
        remainingTime: "Remaining Time",
        timeOnBattery: "Time on Battery",
        saverMode: "Saver Mode",
        batteryType: "Battery Type",
        batteryInfo: "Battery Information",
        sleep: "Sleep",
        hibernate: "Hibernate",
        back: "Back",
        langButton: "RU",
        acStatusLoading: "loading...",
        acStatusOnline: "From network",
        acStatusOffline: "From battery",
    batteryTimeCalculating: "calculating...",
    batteryTimeUnknown: "unknown",
        batteryTimeOnNet: "from network",
    timeUnitHour: "h",
    timeUnitMin: "m",
    timeUnitSec: "s",
        saverModeOn: "On",
        saverModeOff: "Off"
    },
    ru: {
        startMonitoring: "Начать мониторинг",
        powerMonitor: "Монитор питания",
        networkStatus: "Статус сети",
        batteryCharge: "Заряд батареи",
        remainingTime: "Оставшееся время",
        timeOnBattery: "Время от батареи",
        saverMode: "Режим экономии",
        batteryType: "Тип батареи",
        batteryInfo: "Информация о батарее",
        sleep: "Сон",
        hibernate: "Гибернация",
        back: "Назад",
        langButton: "EN",
        acStatusLoading: "загрузка...",
        acStatusOnline: "От сети",
        acStatusOffline: "От батареи",
    batteryTimeCalculating: "вычисление...",
    batteryTimeUnknown: "неизвестно",
        batteryTimeOnNet: "от сети",
    timeUnitHour: "ч",
    timeUnitMin: "мин",
    timeUnitSec: "сек",
        saverModeOn: "Включен",
        saverModeOff: "Выключен"
    }
};

function setLanguage(lang) {
    document.querySelectorAll('[data-key]').forEach(element => {
        const key = element.getAttribute('data-key');
        if (translations[lang] && translations[lang][key]) {
            element.textContent = translations[lang][key];
        }
    });
    const langBtn = document.querySelector('.lang-btn');
    if (langBtn) {
        langBtn.textContent = translations[lang].langButton;
    }
    localStorage.setItem('language', lang);
    window.dispatchEvent(new CustomEvent('languageChange', { detail: { lang: lang } }));
}

document.addEventListener('DOMContentLoaded', () => {
    const langBtn = document.querySelector('.lang-btn');
    
    // Always apply the stored language on page load
    setLanguage(localStorage.getItem('language') || 'ru');

    if (langBtn) {
        langBtn.addEventListener('click', () => {
            let currentLang = localStorage.getItem('language') || 'ru';
            currentLang = currentLang === 'ru' ? 'en' : 'ru';
            setLanguage(currentLang);
        });
    }
});
