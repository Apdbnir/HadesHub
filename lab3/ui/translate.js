const translations = {
    en: {
        startDiskScan: 'Start Disk Scan',
        diskInfo: 'Disk Information',
        back: 'Back',
        langButton: 'RU',
        model: 'Model',
        manufacturer: 'Manufacturer',
        serialNumber: 'Serial Number',
        firmware: 'Firmware',
        memoryInfo: 'Total/Used/Free',
        interfaceType: 'Interface Type',
        supportedModes: 'Supported Modes',
        noDiskInfo: 'No disk information found. Try running the application as administrator.'
    },
    ru: {
        startDiskScan: 'Начать сканирование дисков',
        diskInfo: 'Информация о дисках',
        back: 'Назад',
        langButton: 'EN',
        model: 'Модель',
        manufacturer: 'Производитель',
        serialNumber: 'Серийный номер',
        firmware: 'Прошивка',
        memoryInfo: 'Всего/Использовано/Свободно',
        interfaceType: 'Тип интерфейса',
        supportedModes: 'Поддерживаемые режимы',
        noDiskInfo: 'Информация о дисках не найдена. Попробуйте запустить приложение от имени администратора.'
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
    if (langBtn) { langBtn.textContent = translations[lang].langButton; }
    localStorage.setItem('language', lang);
}

document.addEventListener('DOMContentLoaded', () => {
    setLanguage(localStorage.getItem('language') || 'ru');
    const langBtn = document.querySelector('.lang-btn');
    if (langBtn) {
        langBtn.addEventListener('click', () => {
            let currentLang = localStorage.getItem('language') || 'ru';
            currentLang = currentLang === 'ru' ? 'en' : 'ru';
            setLanguage(currentLang);
        });
    }
});
