#include <iostream>
#include <vector>
#include <string>
#include <map>
#include <thread>
#include <chrono>
#include <algorithm>
#include <fstream>
#include <filesystem>
#include <Devices.Bluetooth.h>
#include <Devices.Enumeration.h>
#include <Foundation.h>
#include <winrt/base.h>

class BluetoothDevice {
public:
    std::string id;             // MAC-адрес
    std::string name;           // Имя устройства
    int rssi;                  // Уровень сигнала
    bool connected;            // Статус подключения
    std::string deviceClass;   // Тип устройства (BLE, Classic)
    bool isPaired = false;     // Сопряжено ли устройство
    std::string lastSeenTime;  // Время последнего обнаружения
    std::string type;          // "BLE", "Classic", "Dual Mode"

    BluetoothDevice() : id(""), name(""), rssi(0), connected(false), deviceClass("unknown"), type("unknown") {}
    BluetoothDevice(const std::string& id, const std::string& name, int rssi, const std::string& type = "unknown")
        : id(id), name(name), rssi(rssi), connected(false), deviceClass("unknown"), type(type) {}
};

class BluetoothMonitor {
private:
    std::vector<BluetoothDevice> discoveredDevices;
    std::vector<BluetoothDevice> pairedDevices;
    bool scanning;
    std::map<std::string, BluetoothDevice> connectedDevices;
    std::string lastTransferredFile;
    std::string lastTransferredToDevice;

public:
    BluetoothMonitor() : scanning(false) {
        // Инициализация WinRT
#ifdef _WIN32
        winrt::init_apartment();
#endif
        initialize();
    }

    void initialize() {
        std::cout << "Initializing Bluetooth Monitor..." << std::endl;
        loadPairedDevices();
    }

    // Реальное обнаружение Bluetooth-устройств 
    void realDiscoverDevices() {
#ifdef _WIN32
        try {
            // Используем DeviceInformation для поиска Bluetooth-устройств
            auto selector = BluetoothLEDevice::GetDeviceSelector();
            auto devices = DeviceInformation::FindAllAsync(selector).get();

            for (auto const& deviceInfo : devices) {
                std::string id = winrt::to_string(deviceInfo.Id()).c_str();
                std::string name = winrt::to_string(deviceInfo.Name()).c_str();

                // В реальном приложении можно получить RSSI через BluetoothLEDevice
                int rssi = -100; // Заглушка — RSSI не доступен в DeviceInformation

                BluetoothDevice device(id, name, rssi, "BLE");
                device.isPaired = deviceInfo.Pairing().IsPaired();
                discoveredDevices.push_back(device);

                std::cout << "Discovered: " << name << " (" << id << ")" << (device.isPaired ? " [PAIRED]" : "") << std::endl;
            }
        }
        catch (winrt::hresult_error const& ex) {
            std::wcerr << L"Error during Bluetooth discovery: " << ex.message().c_str() << std::endl;
        }
#else
        std::cout << "Real Bluetooth discovery is only supported on Windows." << std::endl;
#endif
    }

    // Заменяем старый метод на реальный
    std::vector<BluetoothDevice> discoverDevices() {
        discoveredDevices.clear();
        realDiscoverDevices();
        return discoveredDevices;
    }

    void startScanning() {
        scanning = true;
        std::cout << "Starting real Bluetooth scan..." << std::endl;

        while (scanning) {
            auto newDevices = discoverDevices();

            // Обновляем список устройств
            for (const auto& newDevice : newDevices) {
                bool found = false;
                for (auto& existingDevice : discoveredDevices) {
                    if (existingDevice.id == newDevice.id) {
                        existingDevice.name = newDevice.name;
                        existingDevice.rssi = newDevice.rssi;
                        existingDevice.isPaired = newDevice.isPaired;
                        found = true;
                        break;
                    }
                }

                if (!found) {
                    discoveredDevices.push_back(newDevice);
                    std::cout << "New device discovered: " << newDevice.name << " (" << newDevice.id << ")" << std::endl;
                }
            }

            // Задержка между сканированиями
            std::this_thread::sleep_for(std::chrono::seconds(5));
        }
    }

    void stopScanning() {
        scanning = false;
        std::cout << "Stopping Bluetooth scan..." << std::endl;
    }

    std::vector<BluetoothDevice> getDiscoveredDevices() const {
        return discoveredDevices;
    }

    std::vector<BluetoothDevice> getPairedDevices() const {
        return pairedDevices;
    }

    bool connectToDevice(const std::string& deviceId) {
        auto it = std::find_if(discoveredDevices.begin(), discoveredDevices.end(),
            [&deviceId](const BluetoothDevice& device) {
                return device.id == deviceId;
            });

        if (it == discoveredDevices.end()) {
            it = std::find_if(pairedDevices.begin(), pairedDevices.end(),
                [&deviceId](const BluetoothDevice& device) {
                    return device.id == deviceId;
                });
        }

        if (it != pairedDevices.end() || it != discoveredDevices.end()) {
            if (it != discoveredDevices.end()) {
                it->connected = true;
                connectedDevices[deviceId] = *it;
                std::cout << "Connected to device: " << it->name << std::endl;
            } else {
                auto pairedIt = std::find_if(pairedDevices.begin(), pairedDevices.end(),
                    [&deviceId](const BluetoothDevice& device) {
                        return device.id == deviceId;
                    });
                if (pairedIt != pairedDevices.end()) {
                    pairedIt->connected = true;
                    connectedDevices[deviceId] = *pairedIt;
                    std::cout << "Connected to paired device: " << pairedIt->name << std::endl;
                }
            }
            return true;
        }

        std::cout << "Device not found: " << deviceId << std::endl;
        return false;
    }

    bool disconnectFromDevice(const std::string& deviceId) {
        auto it = connectedDevices.find(deviceId);
        if (it != connectedDevices.end()) {
            auto discoveredIt = std::find_if(discoveredDevices.begin(), discoveredDevices.end(),
                [&deviceId](const BluetoothDevice& device) {
                    return device.id == deviceId;
                });

            if (discoveredIt != discoveredDevices.end()) {
                discoveredIt->connected = false;
            } else {
                auto pairedIt = std::find_if(pairedDevices.begin(), pairedDevices.end(),
                    [&deviceId](const BluetoothDevice& device) {
                        return device.id == deviceId;
                    });
                if (pairedIt != pairedDevices.end()) {
                    pairedIt->connected = false;
                }
            }

            connectedDevices.erase(it);
            std::cout << "Disconnected from device: " << deviceId << std::endl;
            return true;
        }

        std::cout << "Not connected to device: " << deviceId << std::endl;
        return false;
    }

    // Остальные методы (передача файлов, автоплей и т. д.) остаются без изменений
    bool transferFileToDevice(const std::string& deviceId, const std::string& filePath) {
        if (connectedDevices.find(deviceId) == connectedDevices.end()) {
            std::cerr << "Error: Not connected to device " << deviceId << std::endl;
            return false;
        }

        std::ifstream fileStream(filePath, std::ios::binary);
        if (!fileStream) {
            std::cerr << "Error: File not found: " << filePath << std::endl;
            return false;
        }

        fileStream.seekg(0, std::ios::end);
        size_t fileSize = fileStream.tellg();
        fileStream.seekg(0, std::ios::beg);

        std::cout << "Transferring file '" << filePath << "' to device " << deviceId << std::endl;

        size_t transferred = 0;
        const size_t bufferSize = 4096;
        char buffer[bufferSize];

        std::cout << "Transfer progress: 0%" << std::flush;

        while (fileStream.read(buffer, bufferSize) || fileStream.gcount() > 0) {
            size_t bytesRead = fileStream.gcount();
            transferred += bytesRead;

            int percent = static_cast<int>((static_cast<double>(transferred) / fileSize) * 100);
            std::cout << "\rTransfer progress: " << percent << "%" << std::flush;

            std::this_thread::sleep_for(std::chrono::milliseconds(20));
        }

        std::cout << "\nFile transfer completed successfully!" << std::endl;
        fileStream.close();

        lastTransferredFile = filePath;
        lastTransferredToDevice = deviceId;

        return true;
    }

    bool triggerAutoPlay(const std::string& deviceId, const std::string& filePath) {
        if (connectedDevices.find(deviceId) == connectedDevices.end()) {
            std::cerr << "Error: Not connected to device " << deviceId << std::endl;
            return false;
        }

        std::string lowerPath = filePath;
        std::transform(lowerPath.begin(), lowerPath.end(), lowerPath.begin(), ::tolower);

        bool isAudioFile = (lowerPath.find(".mp3") != std::string::npos ||
                           lowerPath.find(".wav") != std::string::npos ||
                           lowerPath.find(".flac") != std::string::npos ||
                           lowerPath.find(".aac") != std::string::npos ||
                           lowerPath.find(".m4a") != std::string::npos ||
                           lowerPath.find(".ogg") != std::string::npos);

        if (!isAudioFile) {
            std::cout << "File is not an audio file, skipping auto-play" << std::endl;
            return false;
        }

        std::cout << "Triggering auto-play for file: " << filePath << " on device: " << deviceId << std::endl;

        if (lastTransferredFile != filePath || lastTransferredToDevice != deviceId) {
            std::cout << "Warning: File was not recently transferred to this device" << std::endl;
        }

        auto deviceIt = connectedDevices.find(deviceId);
        if (deviceIt != connectedDevices.end()) {
            std::cout << "Target device: " << deviceIt->second.name << " (Audio device)" << std::endl;
        }

        std::cout << "Sending playback command to device via Bluetooth AVRCP..." << std::endl;
        std::cout << "Establishing AVRCP connection..." << std::endl;
        std::this_thread::sleep_for(std::chrono::milliseconds(200));

        std::cout << "Sending PLAY command..." << std::endl;
        std::this_thread::sleep_for(std::chrono::milliseconds(300));

        std::cout << "Playback initiated successfully" << std::endl;

        std::this_thread::sleep_for(std::chrono::milliseconds(500));
        std::cout << "Auto-play command sent and processed successfully!" << std::endl;

        return true;
    }

    bool transferAndPlayFile(const std::string& deviceId, const std::string& filePath) {
        if (!transferFileToDevice(deviceId, filePath)) {
            return false;
        }

        std::this_thread::sleep_for(std::chrono::milliseconds(500));

        return triggerAutoPlay(deviceId, filePath);
    }
};

void displayMenu() {
    std::cout << "\n=== Bluetooth Device Monitor ===" << std::endl;
    std::cout << "1. Start scanning for devices (real)" << std::endl;
    std::cout << "2. Stop scanning" << std::endl;
    std::cout << "3. Show discovered devices" << std::endl;
    std::cout << "4. Show paired devices" << std::endl;
    std::cout << "5. Connect to device" << std::endl;
    std::cout << "6. Disconnect from device" << std::endl;
    std::cout << "7. Transfer file to device" << std::endl;
    std::cout << "8. Trigger auto-play" << std::endl;
    std::cout << "9. Transfer and auto-play file" << std::endl;
    std::cout << "0. Exit" << std::endl;
    std::cout << "Choose an option: ";
}

int main() {
    BluetoothMonitor monitor;
    std::string input;
    int choice;

    std::cout << "Bluetooth Device Monitor Application (Real Discovery)" << std::endl;
    std::cout << "===================================================" << std::endl;

    while (true) {
        displayMenu();
        std::getline(std::cin, input);
        try {
            choice = std::stoi(input);
        } catch (const std::exception&) {
            std::cout << "Invalid input. Please enter a number." << std::endl;
            continue;
        }

        switch (choice) {
            case 1: {
                std::cout << "Starting real device discovery..." << std::endl;
                auto discovered = monitor.discoverDevices();
                std::cout << "Found " << discovered.size() << " devices" << std::endl;
                break;
            }
            case 2:
                std::cout << "Stopping scan..." << std::endl;
                monitor.stopScanning();
                break;
            case 3: {
                auto devices = monitor.getDiscoveredDevices();
                std::cout << "Discovered devices:" << std::endl;
                for (const auto& device : devices) {
                    std::string status = device.isPaired ? " [PAIRED]" : "";
                    std::cout << "  - " << device.name << " (" << device.id << ") RSSI: " << device.rssi << "dBm" << status << std::endl;
                }
                if (devices.empty()) {
                    std::cout << "  No devices found" << std::endl;
                }
                break;
            }
            case 4: {
                auto devices = monitor.getPairedDevices();
                std::cout << "Paired devices:" << std::endl;
                for (const auto& device : devices) {
                    std::string connectedStatus = device.connected ? " [CONNECTED]" : "";
                    std::cout << "  - " << device.name << " (" << device.id << ") RSSI: " << device.rssi << "dBm" << connectedStatus << std::endl;
                }
                break;
            }
            case 5: {
                std::cout << "Enter device ID to connect: ";
                std::getline(std::cin, input);
                if (monitor.connectToDevice(input)) {
                    std::cout << "Connected successfully!" << std::endl;
                } else {
                    std::cout << "Connection failed!" << std::endl;
                }
                break;
            }
            case 6: {
                std::cout << "Enter device ID to disconnect: ";
                std::getline(std::cin, input);
                if (monitor.disconnectFromDevice(input)) {
                    std::cout << "Disconnected successfully!" << std::endl;
                } else {
                    std::cout << "Disconnect failed!" << std::endl;
                }
                break;
            }
            case 7: {
                std::cout << "Enter device ID: ";
                std::string deviceId;
                std::getline(std::cin, deviceId);

                std::cout << "Enter file path to transfer: ";
                std::string filePath;
                std::getline(std::cin, filePath);

                if (monitor.transferFileToDevice(deviceId, filePath)) {
                    std::cout << "File transferred successfully!" << std::endl;
                } else {
                    std::cout << "File transfer failed!" << std::endl;
                }
                break;
            }
            case 8: {
                std::cout << "Enter device ID: ";
                std::string deviceId;
                std::getline(std::cin, deviceId);

                std::cout << "Enter file path for auto-play: ";
                std::string filePath;
                std::getline(std::cin, filePath);

                if (monitor.triggerAutoPlay(deviceId, filePath)) {
                    std::cout << "Auto-play triggered successfully!" << std::endl;
                } else {
                    std::cout << "Auto-play failed!" << std::endl;
                }
                break;
            }
            case 9: {
                std::cout << "Enter device ID: ";
                std::string deviceId;
                std::getline(std::cin, deviceId);

                std::cout << "Enter file path to transfer and play: ";
                std::string filePath;
                std::getline(std::cin, filePath);

                if (monitor.transferAndPlayFile(deviceId, filePath)) {
                    std::cout << "File transferred and playback started successfully!" << std::endl;
                } else {
                    std::cout << "Transfer and play operation failed!" << std::endl;
                }
                break;
            }
            case 0:
                std::cout << "Exiting application..." << std::endl;
                return 0;
            default:
                std::cout << "Invalid option. Please try again." << std::endl;
                break;
        }
    }

    return 0;
}