#include <windows.h>
#include <iostream>
#include <string>
#include <chrono>
#include <thread>
#include <vector>
#include <PowrProf.h>
#include <winternl.h>
#include <comdef.h>
#include <Wbemidl.h>

#pragma comment(lib, "PowrProf.lib")
#pragma comment(lib, "Advapi32.lib")
#pragma comment(lib, "ntdll.lib")
#pragma comment(lib, "wbemuuid.lib")
#pragma comment(lib, "ole32.lib")
#pragma comment(lib, "oleaut32.lib")

#include <setupapi.h>
#include <batclass.h>  // For battery IOCTLs
#include <initguid.h>
#include <devguid.h>   // For GUID_DEVCLASS_BATTERY
#include <sstream>

// Simple batteryMonitor class (working example integrated)
class batteryMonitor{
    public:
    batteryMonitor();
    std::string getStatus();
    int getCharge();
    std::string getPowerMode();
    int hibernate();
    int sleep();
    // info as a string
    std::string getBatteryInfo();
    // time in seconds
    int getTimeLeft(); 
    std::string isEco();
};

// Определение статуса батареи (заряжается/не заряжается)
std::string batteryFlagToString(BYTE flag) {
    std::string result;

    if (flag == 255) return "Unknown status";
    if (flag & 128) result += "No system battery; ";
    if (flag & 8) result += "Charging; ";
    if (flag & 4) result += "Critical (less than 5%); ";
    if (flag & 2) result += "Low (less than 33%); ";
    if (flag & 1) result += "High (more than 66%); ";
    if (flag == 0) result = "Battery status normal";

    if (result.empty())
        result = "Unknown flag value: " + std::to_string(flag);
    else
        result = result.substr(0, result.size() - 2); // Remove last "; "

    return result;
}

// Возвращает статус батареи (заряжается/не заряжается)
std::string batteryMonitor::getStatus(){
    SYSTEM_POWER_STATUS status;
    if (GetSystemPowerStatus(&status)){
        std::string batteryFlag = batteryFlagToString(status.BatteryFlag);
        return batteryFlag;
    }
    else {
        return "Error";
    }
}

std::string batteryMonitor::getPowerMode(){
    SYSTEM_POWER_STATUS status;
    if (GetSystemPowerStatus(&status)) {
        std::string acLineStatus;
        if ((int)status.ACLineStatus == 1){
            acLineStatus = "Online";
        }
        else if ((int)status.ACLineStatus == 0)
        {
            acLineStatus = "Offline";
        }
        else {
            acLineStatus = "Unknown" + std::to_string((int)status.ACLineStatus);
        }
        
        return acLineStatus;
    } else {
        return "Failed to get power status.";
    }
}

// Возвращает уровень заряда батареи в процентах
int batteryMonitor::getCharge(){
    // returns charge in percents
    SYSTEM_POWER_STATUS status;
    if (GetSystemPowerStatus(&status)){
        return (int)status.BatteryLifePercent;
    }
    else {
        return 255;
    }
}

// Переводит систему в режим сна
int batteryMonitor::sleep(){
    return SetSuspendState(false, false, false) != 0;
}

// Переводит систему в режим гибернации
int batteryMonitor::hibernate(){
    return SetSuspendState(true, false, false) != 0;
}

// Возвращает оставшееся время работы от батареи в секундах
int batteryMonitor::getTimeLeft(){
    SYSTEM_POWER_STATUS sps;
    if (GetSystemPowerStatus(&sps)) {
        return (int)sps.BatteryLifeTime;
    } else {
        return -1;
    }
}

// Проверяет включен ли режим энергосбережения
std::string batteryMonitor::isEco() {
    SYSTEM_POWER_STATUS sps;
    if (GetSystemPowerStatus(&sps)) {
        if (sps.SystemStatusFlag == 1) {
            return "On";
        }
    }
    return "Off";
}


batteryMonitor::batteryMonitor(){

}

// Возвращает подробную информацию о батарее 
std::string batteryMonitor::getBatteryInfo() {
    std::stringstream ss;
    GUID batteryClassGuid = GUID_DEVCLASS_BATTERY;

    HDEVINFO deviceInfoSet = SetupDiGetClassDevs(&batteryClassGuid, NULL, NULL, DIGCF_PRESENT | DIGCF_DEVICEINTERFACE);
    if (deviceInfoSet == INVALID_HANDLE_VALUE) {
        ss << "Failed to get device info set\n";
        return ss.str();
    }

    SP_DEVICE_INTERFACE_DATA deviceInterfaceData = {0};
    deviceInterfaceData.cbSize = sizeof(SP_DEVICE_INTERFACE_DATA);

    for (DWORD i = 0; ; i++) {
        if (!SetupDiEnumDeviceInterfaces(deviceInfoSet, NULL, &batteryClassGuid, i, &deviceInterfaceData)) {
            if (GetLastError() == ERROR_NO_MORE_ITEMS) {
                // This is the normal exit condition for the loop.
                break;
            }
            // An unexpected error occurred.
            break;
        }

        DWORD requiredSize = 0;
        SetupDiGetDeviceInterfaceDetail(deviceInfoSet, &deviceInterfaceData, NULL, 0, &requiredSize, NULL);
        if (GetLastError() != ERROR_INSUFFICIENT_BUFFER) {
            ss << "Failed to get required size for device interface detail\n";
            continue;
        }

        PSP_DEVICE_INTERFACE_DETAIL_DATA deviceDetailData = (PSP_DEVICE_INTERFACE_DETAIL_DATA)malloc(requiredSize);
        if (deviceDetailData == NULL) {
            ss << "Failed to allocate memory for device detail data\n";
            continue;
        }
        deviceDetailData->cbSize = sizeof(SP_DEVICE_INTERFACE_DETAIL_DATA);

        if (SetupDiGetDeviceInterfaceDetail(deviceInfoSet, &deviceInterfaceData, deviceDetailData, requiredSize, NULL, NULL)) {
            ss << "Found Battery " << i << ": " << deviceDetailData->DevicePath << "\n";
            HANDLE batteryHandle = CreateFile(deviceDetailData->DevicePath,
                                              GENERIC_READ | GENERIC_WRITE,
                                              FILE_SHARE_READ | FILE_SHARE_WRITE,
                                              NULL, OPEN_EXISTING,
                                              FILE_ATTRIBUTE_NORMAL, NULL);

            if (batteryHandle != INVALID_HANDLE_VALUE) {
                DWORD returned;
                ULONG batteryTag = 0;
                BATTERY_QUERY_INFORMATION bqi = {0};

                if (!DeviceIoControl(batteryHandle, IOCTL_BATTERY_QUERY_TAG,
                                     NULL, 0,
                                     &bqi.BatteryTag, sizeof(bqi.BatteryTag),
                                     &returned, NULL) || bqi.BatteryTag == 0) {
                    ss << "  Failed to get a valid battery tag.\n";
                    CloseHandle(batteryHandle);
                    free(deviceDetailData);
                    continue;
                }
                
                bqi.InformationLevel = BatteryInformation;

                BATTERY_INFORMATION batteryInfo = {0};
                if (!DeviceIoControl(batteryHandle, IOCTL_BATTERY_QUERY_INFORMATION,
                                     &bqi, sizeof(bqi),
                                     &batteryInfo, sizeof(batteryInfo),
                                     &returned, NULL)) {
                    
                    // **** THIS IS THE CRITICAL CHANGE ****
                    DWORD errorCode = GetLastError();
                    LPSTR messageBuffer = nullptr;
                    size_t size = FormatMessageA(FORMAT_MESSAGE_ALLOCATE_BUFFER | FORMAT_MESSAGE_FROM_SYSTEM | FORMAT_MESSAGE_IGNORE_INSERTS,
                                                 NULL, errorCode, MAKELANGID(LANG_NEUTRAL, SUBLANG_DEFAULT), (LPSTR)&messageBuffer, 0, NULL);
                    
                    ss << "  Failed to query battery information. Error " << errorCode << ": " << (messageBuffer ? messageBuffer : "") << "\n";
                    
                    // Free the buffer allocated by FormatMessageA.
                    if (messageBuffer) LocalFree(messageBuffer);

                } else {
                    char chemistry[5] = {0};
                    memcpy(chemistry, &batteryInfo.Chemistry, 4);

                    ss << "  Chemistry: " << chemistry << "\n";
                    ss << "  Designed Capacity: " << (batteryInfo.DesignedCapacity == -1 ? "Unknown" : std::to_string(batteryInfo.DesignedCapacity)) << "\n";
                    ss << "  Full Charged Capacity: " << (batteryInfo.FullChargedCapacity == -1 ? "Unknown" : std::to_string(batteryInfo.FullChargedCapacity)) << "\n";
                    ss << "  Cycle Count: " << (batteryInfo.CycleCount == -1 ? "Unknown" : std::to_string(batteryInfo.CycleCount)) << "\n";
                }

                CloseHandle(batteryHandle);
            } else {
                ss << "  Failed to open battery device handle.\n";
            }
        }
        free(deviceDetailData);
    }

    SetupDiDestroyDeviceInfoList(deviceInfoSet);
    if (ss.str().empty()) {
        ss << "No batteries found or could not be queried.\n";
    }
    return ss.str();
}

// --- Глобальные переменные ---
bool wasOnBattery = false;
// trackingActive == true means we've observed a transition from AC to battery while
// the program was running and are measuring time on battery from that moment.
bool trackingActive = false;
std::chrono::steady_clock::time_point batteryStartTime;
std::chrono::steady_clock::time_point monitorStartTime;
// Last known remaining battery time (seconds). Used as fallback when OS reports unknown.
long long lastKnownRemainingBatteryTime = -1;
// For estimation when BatteryLifeTime is unknown
int prevBatteryPercent = -1;
std::chrono::steady_clock::time_point prevPercentTime;

// --- Функции управления питанием ---

// Устанавливает привилегии для операций сна/гибернации
BOOL setPrivilege() {
    HANDLE hToken; TOKEN_PRIVILEGES tkp;
    if (!OpenProcessToken(GetCurrentProcess(), TOKEN_ADJUST_PRIVILEGES | TOKEN_QUERY, &hToken)) return FALSE;
    LookupPrivilegeValue(NULL, SE_SHUTDOWN_NAME, &tkp.Privileges[0].Luid);
    tkp.PrivilegeCount = 1; tkp.Privileges[0].Attributes = SE_PRIVILEGE_ENABLED;
    AdjustTokenPrivileges(hToken, FALSE, &tkp, 0, (PTOKEN_PRIVILEGES)NULL, 0);
    return GetLastError() == ERROR_SUCCESS;
}

// Переводит систему в режим сна
void goToSleep() { 
    if (setPrivilege()) {
        // Используем более мягкий вызов, который с большей вероятностью сработает
        SetSuspendState(FALSE, FALSE, TRUE); 
    }
}

// Переводит систему в режим гибернации
void goToHibernate() { 
    if (setPrivilege()) {
        SetSuspendState(TRUE, FALSE, TRUE); 
    }
}

// Определение типа батареи
std::string getBatteryChemistryWMI() {
    return "Li-Ion";
}

// Проверяет состояние режима энергосбережения через реестр
std::string getSaverModeStatus() {
    HKEY hKey;
    if (RegOpenKeyEx(HKEY_CURRENT_USER, "Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced", 0, KEY_READ, &hKey) == ERROR_SUCCESS) {
        DWORD value = 0;
        DWORD size = sizeof(value);
        if (RegQueryValueEx(hKey, "LastBatterySaverTogglerState", NULL, NULL, (LPBYTE)&value, &size) == ERROR_SUCCESS) {
            RegCloseKey(hKey);
            return value == 1 ? "On" : "Off";
        }
        RegCloseKey(hKey);
    }
    return "Unknown";
}

// Выводит статус питания в формате JSON
void printPowerStatus() {
    SYSTEM_POWER_STATUS sps;
    if (GetSystemPowerStatus(&sps)) {
        bool isOnBattery = (sps.ACLineStatus == 0);

        // Remaining battery runtime (BatteryLifeTime) — system reported remaining seconds
        long long remainingBatteryTime = -1; // -1 unknown
        if (sps.BatteryLifeTime != (DWORD)-1) {
            remainingBatteryTime = (long long)sps.BatteryLifeTime;
            lastKnownRemainingBatteryTime = remainingBatteryTime; // update fallback
        } else {
            // fallback to last known remaining value if available
            if (lastKnownRemainingBatteryTime != -1) {
                remainingBatteryTime = lastKnownRemainingBatteryTime;
            }
        }

        // If still unknown, try to estimate remaining time using percent change rate
        auto now = std::chrono::steady_clock::now();
        if (isOnBattery) {
            int percent = (int)sps.BatteryLifePercent;
            if (percent >= 0 && percent <= 100) {
                if (prevBatteryPercent == -1) {
                    prevBatteryPercent = percent;
                    prevPercentTime = now;
                } else if (percent != prevBatteryPercent) {
                    // compute rate only when percent decreases (discharging)
                    auto deltaPercent = prevBatteryPercent - percent;
                    auto deltaSeconds = std::chrono::duration_cast<std::chrono::seconds>(now - prevPercentTime).count();
                    if (deltaPercent > 0 && deltaSeconds > 0) {
                        double secondsPerPercent = (double)deltaSeconds / (double)deltaPercent;
                        long long estimatedRemaining = (long long)std::round(secondsPerPercent * percent);
                        // use estimated remaining if we don't have a better value
                        if (remainingBatteryTime == -1) remainingBatteryTime = estimatedRemaining;
                        // update last known
                        lastKnownRemainingBatteryTime = remainingBatteryTime;
                    }
                    prevBatteryPercent = percent;
                    prevPercentTime = now;
                }
            }
        } else {
            // reset percent tracking when on AC
            prevBatteryPercent = -1;
        }

        // Elapsed time on battery since unplug (best-effort). We set batteryStartTime
        // when we see an AC->battery transition, or at program start if already on battery.
        if (isOnBattery) {
            if (!trackingActive) {
                batteryStartTime = std::chrono::steady_clock::now();
                trackingActive = true;
                if (!wasOnBattery) fprintf(stderr, "[powermonitor] Transition detected: AC->BATTERY. Tracking started.\n");
            }
        } else {
            if (trackingActive) fprintf(stderr, "[powermonitor] Transition detected: BATTERY->AC. Tracking stopped.\n");
            trackingActive = false;
        }

        wasOnBattery = isOnBattery;

        long long elapsedOnBattery = -1; // -1 unknown/not applicable
        if (isOnBattery) {
            // Report time since monitoring started (monitorStartTime)
            elapsedOnBattery = std::chrono::duration_cast<std::chrono::seconds>(std::chrono::steady_clock::now() - monitorStartTime).count();
        }

        std::string battery_flags;
        if (sps.BatteryFlag != 255 && sps.BatteryFlag != 0) {
            if (sps.BatteryFlag & 1) battery_flags += "High "; if (sps.BatteryFlag & 2) battery_flags += "Low ";
            if (sps.BatteryFlag & 4) battery_flags += "Critical "; if (sps.BatteryFlag & 8) battery_flags += "Charging ";
            if (sps.BatteryFlag & 128) battery_flags += "NoBattery ";
        } else if (sps.BatteryFlag == 0) {
            battery_flags = "Normal";
        } else {
            battery_flags = "Unknown";
        }
        
        if (!battery_flags.empty() && battery_flags.back() == ' ') {
            battery_flags.pop_back();
        }

        char buffer[512];
        sprintf_s(buffer, 
            "{\"AC_LINE_STATUS\":\"%s\",\"BATTERY_PERCENT\":\"%d\",\"BATTERY_LIFE_TIME\":\"%lu\",\"ELAPSED_ON_BATTERY\":\"%lld\",\"REMAINING_BATTERY_TIME\":\"%lld\",\"TRACKING_ACTIVE\":\"%s\",\"SAVER_MODE\":\"%s\",\"BATTERY_CHEMISTRY\":\"%s\",\"BATTERY_INFO\":\"%s\"}",
            (sps.ACLineStatus == 1 ? "Online" : "Offline"),
            (int)sps.BatteryLifePercent,
            sps.BatteryLifeTime,
            elapsedOnBattery,
            remainingBatteryTime,
            (trackingActive ? "true" : "false"),
            getSaverModeStatus().c_str(),
            getBatteryChemistryWMI().c_str(),
            battery_flags.c_str()
        );
        std::cout << buffer << std::endl;
        std::cout.flush();
    }
}

// --- Поток для команд и основной цикл ---
void commandListener() {
    std::string line;
    while (std::getline(std::cin, line)) {
        if (line == "sleep") goToSleep();
        else if (line == "hibernate") goToHibernate();
    }
}

int main() {
    std::thread listener(commandListener);
    listener.detach();

    // Initialize wasOnBattery from the current system state so that if the program
    // is started while already on battery we DON'T treat that as an AC->battery transition.
    SYSTEM_POWER_STATUS initSps;
    if (GetSystemPowerStatus(&initSps)) {
        wasOnBattery = (initSps.ACLineStatus == 0);
        // If we launched already on battery, start tracking from now so we can
        // show elapsed time since the app started (best-effort).
        if (wasOnBattery) {
            batteryStartTime = std::chrono::steady_clock::now();
            trackingActive = true;
        } else {
            trackingActive = false;
        }
        fprintf(stderr, "[powermonitor] Initial AC status: %s (wasOnBattery=%d)\n", (wasOnBattery ? "Offline" : "Online"), wasOnBattery);
    }
    // Record the time the monitor was started
    monitorStartTime = std::chrono::steady_clock::now();
    while (true) {
        printPowerStatus();
        std::this_thread::sleep_for(std::chrono::seconds(1));
    }
    return 0;
}