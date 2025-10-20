const translations = {
    en: {
        startMonitoring: 'Start PCI scan',
        pciScan: 'PCI Devices',
        back: 'Back',
        langButton: 'RU'
    },
    ru: {
        startMonitoring: 'Начать сканирование PCI',
        pciScan: 'Устройства PCI',
        back: 'Назад',
        langButton: 'EN'
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
