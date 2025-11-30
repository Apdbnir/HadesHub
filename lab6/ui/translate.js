// Translation dictionary
const translations = {
  en: {
    bluetoothMonitor: "Bluetooth Device Monitor",
    startScan: "Start Scan",
    stopScan: "Stop Scan",
    refreshPaired: "Refresh Paired Devices",
    availableDevices: "Available Devices",
    scannedDevices: "Scanned Devices",
    pairedDevices: "Paired Devices",
    fileTransfer: "File Transfer",
    selectFile: "Select File",
    transferFile: "Transfer File",
    autoPlay: "Auto-play after transfer",
    status: "Status",
    bluetoothStatus: "Bluetooth Status",
    connectionStatus: "Connection Status",
    back: "Back",
    enableAutoPlay: "Enable Auto-play",
    disableAutoPlay: "Disable Auto-play",
    startMonitoring: "Start Monitoring",
    stopPlayback: "Stop"
  },
  ru: {
    bluetoothMonitor: "Мониторинг Bluetooth устройств",
    startScan: "Начать сканирование",
    stopScan: "Остановить сканирование",
    refreshPaired: "Обновить связанные устройства",
    availableDevices: "Доступные устройства",
    scannedDevices: "Найденные устройства",
    pairedDevices: "Сопряженные устройства",
    fileTransfer: "Передача файла",
    selectFile: "Выбрать файл",
    transferFile: "Передать файл",
    autoPlay: "Автовоспроизведение",
    status: "Статус",
    bluetoothStatus: "Статус Bluetooth",
    connectionStatus: "Статус подключения",
    back: "Назад",
    enableAutoPlay: "Включить автовоспроизведение",
    disableAutoPlay: "Отключить автовоспроизведение",
    startMonitoring: "Начать мониторинг",
    stopPlayback: "Стоп"
  }
};

// Current language (default to Russian)
let currentLang = 'ru';

// Initialize translation
document.addEventListener('DOMContentLoaded', function() {
  translatePage();
  
  // Add event listener to language switcher button
  const langBtn = document.querySelector('.lang-btn');
  if (langBtn) {
    langBtn.addEventListener('click', toggleLanguage);
  }
});

// Toggle between languages
function toggleLanguage() {
  currentLang = currentLang === 'ru' ? 'en' : 'ru';
  translatePage();
  document.querySelector('.lang-btn').textContent = currentLang.toUpperCase();
}

// Translate all elements with data-key attribute
function translatePage() {
  const elements = document.querySelectorAll('[data-key]');
  elements.forEach(function(element) {
    const key = element.getAttribute('data-key');
    const translation = translations[currentLang][key];
    if (translation) {
      if (element.tagName === 'INPUT' && element.type === 'placeholder') {
        element.placeholder = translation;
      } else {
        element.textContent = translation;
      }
    }
  });
  
  // Update language button text
  const langBtn = document.querySelector('.lang-btn');
  if (langBtn) {
    langBtn.textContent = currentLang.toUpperCase();
  }
}