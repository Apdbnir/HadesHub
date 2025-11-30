# Lab 6: Bluetooth Device Monitor - Run Instructions

## Application Overview
This lab implements a Bluetooth device monitoring application with file transfer and automatic playback functionality to Bluetooth audio devices (speakers, headphones).

## Running the Electron Application

1. **Navigate to the UI directory**:
   ```bash
   cd C:\VS Code\HadesHub\lab6\ui
   ```

2. **Install dependencies** (if not already done):
   ```bash
   npm install
   ```

3. **Start the application**:
   ```bash
   npm start
   ```

## Features

- **Bluetooth Device Scanning**: Discover nearby Bluetooth devices
- **Device Connection**: Connect to paired or discovered devices
- **File Transfer**: Transfer files to connected Bluetooth devices
- **Automatic Playback**: Automatically play audio files after transfer to supported devices
- **Bilingual Interface**: Support for both Russian and English

## Using the Application

1. Click "Начать мониторинг" (Start Monitoring) on the intro screen
2. Use "Начать сканирование" (Start Scan) to discover nearby Bluetooth devices
3. Use "Обновить связанные устройства" (Refresh Paired Devices) to see your paired devices
4. Click "Подключить" (Connect) on any device to establish a connection
5. Select a file using "Выбрать файл" (Select File) and transfer it using "Передать файл" (Transfer File)
6. Use "Автовоспроизведение" (Auto-play) to automatically play audio files on the connected device

## Technical Notes

- The application uses `@abandonware/noble` for Bluetooth LE functionality
- Windows-specific Bluetooth APIs are accessed via PowerShell commands
- File transfers are simulated using OBEX protocol
- Audio playback is controlled via AVRCP (Audio/Video Remote Control Profile)

## C++ Implementation

A C++ console application is also available in the main lab6 directory:
- Compile with: `g++ -o bluetooth_monitor main.cpp -std=c++17`
- Run with: `bluetooth_monitor.exe`

## Requirements

- Node.js and npm
- Windows 10 or later (for Bluetooth functionality)
- Bluetooth adapter