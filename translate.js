const translations = {
    en: {
        welcome: "Welcome to HadesHub",
        start: "Start",
        selectLab: "Select a lab",
        lab1: "Lab 1",
        lab2: "Lab 2",
        lab3: "Lab 3",
        lab4: "Lab 4",
        lab5: "Lab 5",
        lab6: "Lab 6",
        back: "Back",
        langButton: "RU"
    },
    ru: {
        welcome: "Добро пожаловать в HadesHub",
        start: "Начать",
        selectLab: "Выберите лабораторную работу",
        lab1: "1 лаба",
        lab2: "2 лаба",
        lab3: "3 лаба",
        lab4: "4 лаба",
        lab5: "5 лаба",
        lab6: "6 лаба",
        back: "Назад",
        langButton: "EN"
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
