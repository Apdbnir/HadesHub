// Translation dictionary
const translations = {
    ru: {
        startWebcamMonitoring: 'Начать мониторинг камеры',
        webcamMonitor: 'Мониторинг камеры',
        webcamStatus: 'Статус камеры',
        webcamInfo: 'Информация о камере',
        recordingStatus: 'Статус записи',
        hiddenMode: 'Скрытый режим',
        preview: 'Предпросмотр',
        capturePhoto: 'Сделать фото',
        toggleHidden: 'Переключить скрытый режим',
        back: 'Назад'
    },
    en: {
        startWebcamMonitoring: 'Start Webcam Monitoring',
        webcamMonitor: 'Webcam Monitor',
        webcamStatus: 'Webcam Status',
        webcamInfo: 'Camera Information',
        recordingStatus: 'Recording Status',
        hiddenMode: 'Hidden Mode',
        preview: 'Preview',
        capturePhoto: 'Capture Photo',
        toggleHidden: 'Toggle Hidden Mode',
        back: 'Back'
    }
};

function loadTranslations() {
    const lang = localStorage.getItem('lang') || 'en';
    const elements = document.querySelectorAll('[data-key]');

    elements.forEach(element => {
        const key = element.getAttribute('data-key');
        if (translations[lang] && translations[lang][key]) {
            if (element.tagName === 'INPUT' && element.type === 'button') {
                element.value = translations[lang][key];
            } else {
                element.textContent = translations[lang][key];
            }
        }
    });
}