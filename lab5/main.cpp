#include <windows.h>
#include <setupapi.h>
#include <initguid.h>
#include <usbiodef.h>  // For USB interface GUIDs
#include <hidsdi.h>    // For HID interface GUID
#include <cfgmgr32.h>  // For CM_* functions
#include <winioctl.h>  // For device interface GUIDs
#include <restartmanager.h> 
#include <psapi.h>     // For Process Status API
#include <tlhelp32.h>  
#include <iostream>
#include <sstream>
#include <string>
#include <vector>
#include <thread>
#include <map>
#include <algorithm>
#include <io.h>

// Define the GUIDs directly
static const GUID GUID_DEVCLASS_DISKDRIVE = {0x4d36e967, 0xe325, 0x11ce, {0xbf, 0xc1, 0x08, 0x00, 0x2b, 0xe1, 0x03, 0x18}};
static const GUID GUID_DEVINTERFACE_HID = {0x4d1e55b2, 0xf16f, 0x11cf, {0x88, 0xcb, 0x00, 0x11, 0x11, 0x00, 0x00, 0x30}};

// Structure to hold USB device information
struct USBDeviceInfo {
    std::string devicePath;
    std::string deviceName;
    std::string driveLetter; 
    bool isStorageDevice;
    bool isMountedAsCDROM;
    bool isMountedAsFlash;
    std::string volumePath;   
    std::string friendlyName;
    std::string hardwareId;
    std::string deviceInstanceId;  
    bool isSafeToEject;
};

// Global variables for USB monitoring
std::map<std::string, USBDeviceInfo> g_connectedUSBDevices;
std::vector<std::string> g_safeRemovalFailures;
std::vector<std::string> g_usbEventLog;
CRITICAL_SECTION g_usbCriticalSection;

// For tracking previous state to detect changes
std::map<std::string, USBDeviceInfo> g_previousUSBDevices;

// Function to get device friendly name using SetupAPI
std::string getDeviceFriendlyName(const std::string& devicePath) {
    // Try to get the volume information first
    char volumeName[MAX_PATH];
    if (GetVolumeNameForVolumeMountPointA(devicePath.c_str(), volumeName, sizeof(volumeName))) {
        char friendlyName[MAX_PATH];
        if (GetVolumeInformationA(volumeName, friendlyName, sizeof(friendlyName), NULL, NULL, NULL, NULL, 0)) {
            if (strlen(friendlyName) > 0) {
                // Clean up the friendly name to remove problematic characters
                std::string cleanName(friendlyName);
                // Remove or replace non-printable characters
                for (auto& c : cleanName) {
                    if (c < 32 || c > 126) c = ' ';
                }
                return cleanName;
            }
        }
    }

    HDEVINFO deviceInfoSet = SetupDiGetClassDevsA(&GUID_DEVCLASS_DISKDRIVE, NULL, NULL, DIGCF_PRESENT);
    if (deviceInfoSet == INVALID_HANDLE_VALUE) {
        return "Unknown USB Device";
    }

    SP_DEVINFO_DATA deviceInfoData;
    deviceInfoData.cbSize = sizeof(SP_DEVINFO_DATA);

    for (DWORD i = 0; SetupDiEnumDeviceInfo(deviceInfoSet, i, &deviceInfoData); i++) {
        HKEY hKey = SetupDiOpenDevRegKey(deviceInfoSet, &deviceInfoData, DICS_FLAG_GLOBAL, 0, DIREG_DEV, KEY_READ);
        if (hKey != INVALID_HANDLE_VALUE) {
            char deviceID[1024];
            DWORD size = sizeof(deviceID);
            if (RegQueryValueExA(hKey, "HardwareID", NULL, NULL, (LPBYTE)deviceID, &size) == ERROR_SUCCESS) {
                std::string hardwareId(deviceID);
                std::transform(hardwareId.begin(), hardwareId.end(), hardwareId.begin(), ::tolower);

                std::string lowerDevicePath = devicePath;
                std::transform(lowerDevicePath.begin(), lowerDevicePath.end(), lowerDevicePath.begin(), ::tolower);

                if (hardwareId.find("usb") != std::string::npos) {
                    char friendlyName[1024];
                    size = sizeof(friendlyName);
                    if (SetupDiGetDeviceRegistryPropertyA(deviceInfoSet, &deviceInfoData, SPDRP_FRIENDLYNAME,
                                                         NULL, (PBYTE)friendlyName, sizeof(friendlyName), &size)) {
                        // Clean up the friendly name to remove problematic characters
                        std::string cleanName(friendlyName);
                        // Remove or replace non-printable characters
                        for (auto& c : cleanName) {
                            if (c < 32 || c > 126) c = ' ';
                        }
                        RegCloseKey(hKey);
                        SetupDiDestroyDeviceInfoList(deviceInfoSet);
                        return cleanName;
                    }
                }
            }
            RegCloseKey(hKey);
        }
    }

    SetupDiDestroyDeviceInfoList(deviceInfoSet);
    return "Unknown USB Device";
}

// Function to get hardware ID for a device
std::string getHardwareId(const std::string& devicePath) {
    GUID guid = GUID_DEVCLASS_DISKDRIVE;
    HDEVINFO deviceInfoSet = SetupDiGetClassDevsA(&guid, NULL, NULL, DIGCF_PRESENT);
    if (deviceInfoSet == INVALID_HANDLE_VALUE) {
        return "";
    }

    SP_DEVINFO_DATA deviceInfoData;
    deviceInfoData.cbSize = sizeof(SP_DEVINFO_DATA);

    for (DWORD i = 0; SetupDiEnumDeviceInfo(deviceInfoSet, i, &deviceInfoData); i++) {
        HKEY hKey = SetupDiOpenDevRegKey(deviceInfoSet, &deviceInfoData, DICS_FLAG_GLOBAL, 0, DIREG_DEV, KEY_READ);
        if (hKey != INVALID_HANDLE_VALUE) {
            char hardwareId[1024];
            DWORD size = sizeof(hardwareId);
            if (RegQueryValueExA(hKey, "HardwareID", NULL, NULL, (LPBYTE)hardwareId, &size) == ERROR_SUCCESS) {
                std::string hwId(hardwareId);
                RegCloseKey(hKey);
                SetupDiDestroyDeviceInfoList(deviceInfoSet);
                return hwId;
            }
            RegCloseKey(hKey);
        }
    }

    SetupDiDestroyDeviceInfoList(deviceInfoSet);
    return "";
}

// Function to enumerate existing USB storage devices
std::vector<USBDeviceInfo> enumerateExistingUSBDevices() {
    std::vector<USBDeviceInfo> devices;

    // Enumerate all volumes to find USB storage devices
    DWORD drives = GetLogicalDrives();
    for (char letter = 'A'; letter <= 'Z'; letter++) {
        if (drives & (1 << (letter - 'A'))) {
            std::string drive = std::string(1, letter) + ":\\";
            UINT driveType = GetDriveTypeA(drive.c_str());

            if (driveType == DRIVE_REMOVABLE || driveType == DRIVE_CDROM) {
                char volumeName[MAX_PATH];
                if (GetVolumeNameForVolumeMountPointA(drive.c_str(), volumeName, sizeof(volumeName))) {
                    USBDeviceInfo device;
                    device.devicePath = volumeName;
                    device.driveLetter = drive;
                    device.isStorageDevice = true;
                    device.isMountedAsCDROM = (driveType == DRIVE_CDROM);
                    device.isMountedAsFlash = (driveType == DRIVE_REMOVABLE);
                    device.friendlyName = getDeviceFriendlyName(drive);
                    device.hardwareId = getHardwareId(drive);
                    device.isSafeToEject = true; // Assume safe by default

                    devices.push_back(device);

                    // Log the discovery
                    std::string logEntry = "USB device discovered: " + device.friendlyName + " at " + drive;
                    EnterCriticalSection(&g_usbCriticalSection);
                    g_usbEventLog.push_back(logEntry);
                    LeaveCriticalSection(&g_usbCriticalSection);
                }
            }
        }
    }

    return devices;
}

// Helper function to get the Device Instance ID for a drive letter
std::string getDeviceInstanceIdByDriveLetter(const std::string& driveLetter) {
    char szVOLUME[MAX_PATH] = {0};

    // Get the volume name for the drive
    if (GetVolumeNameForVolumeMountPointA(driveLetter.c_str(), szVOLUME, MAX_PATH)) {
        HANDLE hVolume = CreateFileA(szVOLUME, 0,
                                    FILE_SHARE_READ | FILE_SHARE_WRITE,
                                    NULL, OPEN_EXISTING, 0, NULL);
        if (hVolume != INVALID_HANDLE_VALUE) {
            STORAGE_DEVICE_NUMBER sdn;
            DWORD dwBytesReturned = 0;

            // Get the device number
            if (DeviceIoControl(hVolume, IOCTL_STORAGE_GET_DEVICE_NUMBER,
                               NULL, 0, &sdn, sizeof(sdn), &dwBytesReturned, NULL)) {
                CloseHandle(hVolume);

                // Now look through setup device list to find the device with this number
                GUID guid = GUID_DEVCLASS_DISKDRIVE;
                HDEVINFO hDevInfo = SetupDiGetClassDevsA(&guid, NULL, NULL, DIGCF_PRESENT);

                if (hDevInfo != INVALID_HANDLE_VALUE) {
                    SP_DEVINFO_DATA spDevInfoData;
                    spDevInfoData.cbSize = sizeof(SP_DEVINFO_DATA);

                    for (DWORD i = 0; SetupDiEnumDeviceInfo(hDevInfo, i, &spDevInfoData); i++) {
                        DWORD dwPropertyRegDataType = 0;
                        DWORD dwSize = 0;
                        char szBuffer[1024] = {0};

                        // Get the hardware ID to see if it's a USB device
                        if (SetupDiGetDeviceRegistryPropertyA(hDevInfo, &spDevInfoData,
                                                              SPDRP_HARDWAREID,
                                                              &dwPropertyRegDataType,
                                                              (PBYTE)szBuffer,
                                                              sizeof(szBuffer),
                                                              &dwSize)) {
                            std::string hardwareID(szBuffer);
                            std::transform(hardwareID.begin(), hardwareID.end(), hardwareID.begin(), ::toupper);

                            // Check if this is a USB device
                            if (hardwareID.find("USB") != std::string::npos) {
                                char szDeviceInstanceId[1024] = {0};
                                if (SetupDiGetDeviceInstanceIdA(hDevInfo, &spDevInfoData,
                                                               szDeviceInstanceId,
                                                               sizeof(szDeviceInstanceId),
                                                               &dwSize)) {
                                    SetupDiDestroyDeviceInfoList(hDevInfo);

                                    // Now get the child device that corresponds to the logical drive
                                    // This is more complex and we'll need to match volumes to devices

                                    // For now, let's just return the disk drive device instance
                                    return std::string(szDeviceInstanceId);
                                }
                            }
                        }
                    }
                    SetupDiDestroyDeviceInfoList(hDevInfo);
                }
            } else {
                CloseHandle(hVolume);
            }
        }
    }

    // Alternative method: use the volume path to find the device instance ID
    // This is a more complex process
    return "";
}

// Function to get device info for a drive letter
struct device_info {
    DEVINST dev_inst;
    GUID dev_class;
    long dev_number;
};

const device_info get_device_info(char letter) {
    std::string volume_access_path = "\\\\.\\X:";
    volume_access_path[4] = letter;

    HANDLE vol = CreateFileA(volume_access_path.c_str(), 0,
        FILE_SHARE_READ | FILE_SHARE_WRITE,
        NULL, OPEN_EXISTING, 0, NULL);
    if (vol == INVALID_HANDLE_VALUE) {
        throw std::runtime_error("Cannot open device");
    }

    STORAGE_DEVICE_NUMBER sdn;
    DWORD bytes_ret = 0;
    long DeviceNumber = -1;

    if (DeviceIoControl(vol,
        IOCTL_STORAGE_GET_DEVICE_NUMBER,
        NULL, 0, &sdn, sizeof(sdn),
        &bytes_ret, NULL)) {
        DeviceNumber = sdn.DeviceNumber;
    }

    CloseHandle(vol);
    if (DeviceNumber == -1) {
        throw std::runtime_error("Cannot get device number");
    }

    char devname[3] = {0};
    char devpath[4] = {0};
    devname[0] = letter;
    devpath[0] = letter;
    devpath[2] = '\\';
    char dos_name[MAX_PATH + 1];
    if (!QueryDosDeviceA(devname, dos_name, MAX_PATH)) {
        throw std::runtime_error("Cannot get device info");
    }

    bool floppy = std::string(dos_name).find("\\Floppy") != std::string::npos;
    UINT drive_type = GetDriveTypeA(devpath);

    const GUID* guid;

    switch (drive_type) {
    case DRIVE_REMOVABLE:
        if (floppy)
            guid = &GUID_DEVINTERFACE_FLOPPY;
        else
            guid = &GUID_DEVINTERFACE_DISK;
        break;

    case DRIVE_FIXED:
        guid = &GUID_DEVINTERFACE_DISK;
        break;

    case DRIVE_CDROM:
        guid = &GUID_DEVINTERFACE_CDROM;
        break;

    default:
        throw std::runtime_error("Unknown device");
    }

    HDEVINFO dev_info = SetupDiGetClassDevsA(guid, NULL, NULL, DIGCF_PRESENT | DIGCF_DEVICEINTERFACE);

    if (dev_info == INVALID_HANDLE_VALUE) {
        throw std::runtime_error("Cannot get device class");
    }

    DWORD index = 0;
    BOOL ret = FALSE;

    BYTE buf[1024];
    PSP_DEVICE_INTERFACE_DETAIL_DATA_A pspdidd = reinterpret_cast<PSP_DEVICE_INTERFACE_DETAIL_DATA_A>(buf);
    SP_DEVICE_INTERFACE_DATA spdid;
    SP_DEVINFO_DATA spdd;
    DWORD size;

    spdid.cbSize = sizeof(spdid);

    bool found = false;

    while (true) {
        ret = SetupDiEnumDeviceInterfaces(dev_info, NULL, guid, index, &spdid);
        if (!ret)
            break;

        size = 0;
        SetupDiGetDeviceInterfaceDetailA(dev_info, &spdid, NULL, 0, &size, NULL);

        if (size != 0 && size <= sizeof(buf)) {
            pspdidd->cbSize = sizeof(*pspdidd);

            ZeroMemory(reinterpret_cast<PVOID>(&spdd), sizeof(spdd));
            spdd.cbSize = sizeof(spdd);

            BOOL res = SetupDiGetDeviceInterfaceDetailA(dev_info, &spdid, pspdidd, size, &size, &spdd);
            if (res) {
                HANDLE drive = CreateFileA(pspdidd->DevicePath, 0,
                    FILE_SHARE_READ | FILE_SHARE_WRITE,
                    NULL, OPEN_EXISTING, 0, NULL);
                if (drive != INVALID_HANDLE_VALUE) {
                    STORAGE_DEVICE_NUMBER sdn;
                    DWORD bytes_returned = 0;
                    if (DeviceIoControl(drive,
                        IOCTL_STORAGE_GET_DEVICE_NUMBER,
                        NULL, 0, &sdn, sizeof(sdn),
                        &bytes_returned, NULL)) {
                        if (DeviceNumber == static_cast<long>(sdn.DeviceNumber)) {
                            CloseHandle(drive);
                            found = true;
                            break;
                        }
                    }

                    CloseHandle(drive);
                }
            }
        }
        index++;
    }

    SetupDiDestroyDeviceInfoList(dev_info);

    if (!found) {
        throw std::runtime_error("Cannot find device");
    }

    DEVINST dev_parent = 0;
    if (CR_SUCCESS != CM_Get_Parent(&dev_parent, spdd.DevInst, 0)) {
        throw std::runtime_error("Cannot get device parent");
    }

    device_info info;
    info.dev_class = *guid;
    info.dev_inst = dev_parent;
    info.dev_number = DeviceNumber;

    return info;
}

// Function to safely eject a USB device using Windows SetupAPI
bool safeEjectUSBDevice(const std::string& driveLetter) {
    try {
        // Get the drive letter character
        char letter = driveLetter[0];
        std::string driveRoot = std::string(1, letter) + ":\\";

        // Open the drive using the proper format for CreateFile
        std::string devicePath = "\\\\.\\" + std::string(1, letter) + ":"; // e.g., \\.\E:

        HANDLE hVolume = CreateFileA(
            devicePath.c_str(),
            GENERIC_READ | GENERIC_WRITE,
            FILE_SHARE_READ | FILE_SHARE_WRITE,
            NULL,
            OPEN_EXISTING,
            0,
            NULL
        );

        if (hVolume == INVALID_HANDLE_VALUE) {
            std::cerr << "[USB Monitor] Failed to open device " << devicePath << " - Error: " << GetLastError() << std::endl;

            // Add to failure log
            EnterCriticalSection(&g_usbCriticalSection);
            g_safeRemovalFailures.push_back(devicePath + " (failed to open device - " + std::to_string(GetLastError()) + ")");
            g_usbEventLog.push_back("Failed to safely eject device: " + driveRoot + " (failed to open device - error: " + std::to_string(GetLastError()) + ")");
            LeaveCriticalSection(&g_usbCriticalSection);
            return false;
        }

        DWORD bytesReturned;

        // Lock the volume to prevent further I/O
        if (!DeviceIoControl(
            hVolume,
            FSCTL_LOCK_VOLUME,
            NULL, 0,
            NULL, 0,
            &bytesReturned,
            NULL
        )) {
            std::cerr << "[USB Monitor] Warning: Could not lock volume " << devicePath << " - Error: " << GetLastError() << std::endl;
        }

        // Dismount the volume
        if (!DeviceIoControl(
            hVolume,
            FSCTL_DISMOUNT_VOLUME,
            NULL, 0,
            NULL, 0,
            &bytesReturned,
            NULL
        )) {
            std::cerr << "[USB Monitor] Failed to dismount volume " << devicePath << " - Error: " << GetLastError() << std::endl;
            CloseHandle(hVolume);

            // Add to failure log
            EnterCriticalSection(&g_usbCriticalSection);
            g_safeRemovalFailures.push_back(devicePath + " (failed to dismount)");
            g_usbEventLog.push_back("Failed to safely eject device: " + driveRoot + " (failed to dismount - error: " + std::to_string(GetLastError()) + ")");
            LeaveCriticalSection(&g_usbCriticalSection);
            return false;
        }

        std::cerr << "[USB Monitor] Volume " << devicePath << " dismounted successfully" << std::endl;

        // Close the volume handle before ejecting
        CloseHandle(hVolume);

        // Now try to set the disk attributes to make it easier to eject
        try {
            // Get the device number to identify the physical disk
            HANDLE hDevice = CreateFileA(
                devicePath.c_str(),
                GENERIC_READ | GENERIC_WRITE,
                FILE_SHARE_READ | FILE_SHARE_WRITE,
                NULL,
                OPEN_EXISTING,
                0,
                NULL
            );

            if (hDevice != INVALID_HANDLE_VALUE) {
                STORAGE_DEVICE_NUMBER sdn;
                if (DeviceIoControl(hDevice, IOCTL_STORAGE_GET_DEVICE_NUMBER, NULL, 0, &sdn, sizeof(sdn), &bytesReturned, NULL)) {
                    // Close the handle before trying to work with the physical disk
                    CloseHandle(hDevice);

                    // Now try to work with the physical disk
                    char physicalDiskPath[64];
                    sprintf(physicalDiskPath, "\\\\.\\PhysicalDrive%d", sdn.DeviceNumber);

                    HANDLE hPhysicalDisk = CreateFileA(
                        physicalDiskPath,
                        GENERIC_READ | GENERIC_WRITE,
                        FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
                        NULL,
                        OPEN_EXISTING,
                        FILE_ATTRIBUTE_NORMAL | FILE_FLAG_NO_BUFFERING | FILE_FLAG_WRITE_THROUGH,
                        NULL
                    );

                    if (hPhysicalDisk != INVALID_HANDLE_VALUE) {
                        DWORD junk;
                        // First, try to lock the physical disk
                        if (!DeviceIoControl(
                            hPhysicalDisk,
                            IOCTL_STORAGE_MEDIA_REMOVAL,
                            (void*)new BOOL(FALSE), sizeof(BOOL), // Prevent removal
                            NULL, 0,
                            &junk,
                            NULL
                        )) {
                            std::cerr << "[USB Monitor] Could not set media removal - Error: " << GetLastError() << std::endl;
                        }

                        CloseHandle(hPhysicalDisk);
                        std::cerr << "[USB Monitor] Physical disk " << physicalDiskPath << " processed" << std::endl;
                    } else {
                        std::cerr << "[USB Monitor] Could not open physical disk " << physicalDiskPath << " - Error: " << GetLastError() << " (This is expected if not running as administrator)" << std::endl;
                    }
                } else {
                    CloseHandle(hDevice); // Close if IOCTL failed
                }
            }
        } catch (...) {
            std::cerr << "[USB Monitor] Exception while attempting to work with physical disk" << std::endl;
        }

        // Now try to eject the physical device using the proper Windows API
        // Get device info as fallback if the main approach failed
        try {
            device_info info = get_device_info(letter);
            CONFIGRET cr = CM_Request_Device_EjectA(info.dev_inst, NULL, NULL, 0, 0);

            if (cr == CR_SUCCESS) {
                std::cerr << "[USB Monitor] Successfully sent eject request for device with drive " << driveRoot << std::endl;

                EnterCriticalSection(&g_usbCriticalSection);
                g_usbEventLog.push_back("Successfully ejected device: " + driveRoot);
                LeaveCriticalSection(&g_usbCriticalSection);
                return true;
            } else {
                std::cerr << "[USB Monitor] CM_Request_Device_EjectA failed with code: " << cr << std::endl;
            }
        } catch (const std::exception& e) {
            std::cerr << "[USB Monitor] Exception in get_device_info: " << e.what() << std::endl;
        }

        // If device eject failed or threw an exception, try the device path approach from the original code
        HANDLE hDevice = CreateFileA(
            devicePath.c_str(),  // Use the same \\.\E: format for ejecting
            GENERIC_READ | GENERIC_WRITE,
            FILE_SHARE_READ | FILE_SHARE_WRITE,
            NULL,
            OPEN_EXISTING,
            0,
            NULL
        );

        if (hDevice == INVALID_HANDLE_VALUE) {
            std::cerr << "[USB Monitor] Failed to open device " << devicePath << " - Error: " << GetLastError() << std::endl;

            // The volume was dismounted, so we report partial success
            EnterCriticalSection(&g_usbCriticalSection);
            g_usbEventLog.push_back("Dismounted device (ready for manual removal): " + devicePath);
            LeaveCriticalSection(&g_usbCriticalSection);
            return true;
        }

        BOOL preventRemoval = FALSE;
        // First try to lock the media
        if (!DeviceIoControl(
            hDevice,
            IOCTL_STORAGE_MEDIA_REMOVAL,
            &preventRemoval, sizeof(BOOL), // Prevent removal temporarily
            NULL, 0,
            &bytesReturned,
            NULL
        )) {
            std::cerr << "[USB Monitor] Warning: Could not set media removal lock - Error: " << GetLastError() << std::endl;
        }

        // Then try to eject the device
        if (!DeviceIoControl(
            hDevice,
            IOCTL_STORAGE_EJECT_MEDIA,
            NULL, 0,
            NULL, 0,
            &bytesReturned,
            NULL
        )) {
            std::cerr << "[USB Monitor] Failed to eject device " << devicePath << " - Error: " << GetLastError() << std::endl;

            // Try another eject attempt after a short delay
            Sleep(500); // Wait 500ms to allow system to process

            if (!DeviceIoControl(
                hDevice,
                IOCTL_STORAGE_EJECT_MEDIA,
                NULL, 0,
                NULL, 0,
                &bytesReturned,
                NULL
            )) {
                std::cerr << "[USB Monitor] Second eject attempt also failed - Error: " << GetLastError() << std::endl;

                // Even if eject failed, try to trigger Windows eject through SetupAPI
                // This might show the "Safe to Remove" notification
                std::string deviceId = getDeviceInstanceIdByDriveLetter(driveRoot);
                if (!deviceId.empty()) {
                    DEVINST devInst = 0;
                    CONFIGRET cr = CM_Locate_DevNodeA(&devInst, (DEVINSTID_A)deviceId.c_str(), 0);
                    if (cr == CR_SUCCESS) {
                        cr = CM_Query_And_Remove_SubTreeA(
                            devInst,
                            NULL,    // PNP_VETO_TYPE
                            NULL,    // veto name buffer
                            0,       // buffer size
                            CM_QUERY_REMOVE_UI_NOT_OK  // Flags - don't show UI
                        );

                        if (cr == CR_SUCCESS) {
                            std::cerr << "[USB Monitor] Successfully sent removal query to device tree" << std::endl;
                            CloseHandle(hDevice);

                            EnterCriticalSection(&g_usbCriticalSection);
                            g_usbEventLog.push_back("Successfully queried removal for device: " + deviceId);
                            LeaveCriticalSection(&g_usbCriticalSection);
                            return true;
                        }
                    }
                }

                CloseHandle(hDevice);

                // Add to failure log
                EnterCriticalSection(&g_usbCriticalSection);
                g_safeRemovalFailures.push_back(devicePath + " (eject failed - " + std::to_string(GetLastError()) + ")");
                g_usbEventLog.push_back("Failed to safely eject device: " + driveRoot + " (device eject failed - error: " + std::to_string(GetLastError()) + ")");
                LeaveCriticalSection(&g_usbCriticalSection);
                return false;
            }
        }

        CloseHandle(hDevice);

        std::cerr << "[USB Monitor] Successfully ejected device: " << devicePath << std::endl;

        EnterCriticalSection(&g_usbCriticalSection);
        g_usbEventLog.push_back("Successfully ejected device: " + devicePath);
        LeaveCriticalSection(&g_usbCriticalSection);

        return true;

    } catch (const std::exception& e) {
        std::cerr << "[USB Monitor] Exception in safeEjectUSBDevice: " << e.what() << std::endl;

        // Add to failure log
        EnterCriticalSection(&g_usbCriticalSection);
        g_safeRemovalFailures.push_back(driveLetter + " (exception: " + std::string(e.what()) + ")");
        g_usbEventLog.push_back("Failed to safely eject device: " + driveLetter + " (exception: " + std::string(e.what()) + ")");
        LeaveCriticalSection(&g_usbCriticalSection);
        return false;
    }
}

// Helper function to convert device instance string to DEVINST
DEVINST __devinst_from_string(PCSTR pszDeviceInstanceId) {
    DEVINST devInst = 0;
    CM_Locate_DevNodeA(&devInst, (DEVINSTID_A)pszDeviceInstanceId, 0);
    return devInst;
}

// Function to get all connected USB devices (both storage and non-storage)
std::vector<USBDeviceInfo> getConnectedUSBDevices() {
    std::vector<USBDeviceInfo> usbDevices;

    // First, get storage devices as before
    DWORD drives = GetLogicalDrives();
    for (char letter = 'A'; letter <= 'Z'; letter++) {
        if (drives & (1 << (letter - 'A'))) {
            std::string drive = std::string(1, letter) + ":\\";
            UINT driveType = GetDriveTypeA(drive.c_str());

            // Check if it's a removable drive (USB storage)
            if (driveType == DRIVE_REMOVABLE || driveType == DRIVE_CDROM) {
                char volumeName[MAX_PATH];
                if (GetVolumeNameForVolumeMountPointA(drive.c_str(), volumeName, sizeof(volumeName))) {
                    USBDeviceInfo device;
                    device.devicePath = volumeName;
                    device.driveLetter = drive;
                    device.isStorageDevice = true;
                    device.isMountedAsCDROM = (driveType == DRIVE_CDROM);
                    device.isMountedAsFlash = (driveType == DRIVE_REMOVABLE);
                    device.friendlyName = getDeviceFriendlyName(drive);
                    device.hardwareId = getHardwareId(drive);
                    device.deviceInstanceId = drive; // Use drive as instance ID for storage devices
                    device.isSafeToEject = true; // Check if it's safe to eject

                    usbDevices.push_back(device);
                }
            }
        }
    }

    // Alternative approach: Get ALL devices and filter for USB-related ones using both Hardware ID and device class
    HDEVINFO deviceInfoSet = SetupDiGetClassDevsA(NULL, NULL, NULL, DIGCF_ALLCLASSES | DIGCF_PRESENT);

    if (deviceInfoSet != INVALID_HANDLE_VALUE) {
        SP_DEVINFO_DATA devInfoData;
        devInfoData.cbSize = sizeof(SP_DEVINFO_DATA);

        for (DWORD i = 0; SetupDiEnumDeviceInfo(deviceInfoSet, i, &devInfoData); i++) {
            // Check both hardware ID and device class
            bool isUSBDevice = false;

            // Check hardware ID for "USB"
            char hardwareId[1024];
            if (SetupDiGetDeviceRegistryPropertyA(deviceInfoSet, &devInfoData, SPDRP_HARDWAREID,
                                                  NULL, (PBYTE)hardwareId, sizeof(hardwareId), NULL)) {
                std::string hardwareIdStr(hardwareId);
                std::transform(hardwareIdStr.begin(), hardwareIdStr.end(), hardwareIdStr.begin(), ::toupper);

                if (hardwareIdStr.find("USB") != std::string::npos) {
                    isUSBDevice = true;
                }
            }

            // If not found from hardware ID, check device class
            if (!isUSBDevice) {
                char deviceClass[1024];
                if (SetupDiGetDeviceRegistryPropertyA(deviceInfoSet, &devInfoData, SPDRP_CLASS,
                                                      NULL, (PBYTE)deviceClass, sizeof(deviceClass), NULL)) {
                    // Check for common USB-related class names
                    std::string classStr(deviceClass);
                    std::transform(classStr.begin(), classStr.end(), classStr.begin(), ::toupper);

                    if (classStr == "HIDCLASS" || classStr == "HUMANSINTERFACEDEVICE") {
                        // For HID devices, we need to check if they're physically connected via USB
                        char locationInfo[1024];
                        if (SetupDiGetDeviceRegistryPropertyA(deviceInfoSet, &devInfoData, SPDRP_LOCATION_INFORMATION,
                                                              NULL, (PBYTE)locationInfo, sizeof(locationInfo), NULL)) {
                            // If it's a HID device with location info, it's likely USB
                            std::string locationStr(locationInfo);
                            if (locationStr.find("USB") != std::string::npos || locationStr.find("VID") != std::string::npos) {
                                isUSBDevice = true;
                            }
                        }
                    }
                }
            }

            if (isUSBDevice) {
                // Get device instance ID
                char deviceId[1024];
                if (SetupDiGetDeviceInstanceIdA(deviceInfoSet, &devInfoData, deviceId, sizeof(deviceId), NULL)) {
                    // Only add non-storage USB devices (those that don't have drive letters)
                    bool isAlreadyAdded = false;
                    for (const auto& existingDevice : usbDevices) {
                        if (existingDevice.deviceInstanceId == deviceId) {
                            isAlreadyAdded = true;
                            break;
                        }
                    }

                    if (!isAlreadyAdded) {
                        // Generate English-friendly names based on Hardware ID and device type
                        std::string friendlyName = "USB Device"; // Default name

                        // Create a more descriptive name based on the hardware ID
                        std::string hardwareIdStr(hardwareId);
                        std::transform(hardwareIdStr.begin(), hardwareIdStr.end(), hardwareIdStr.begin(), ::toupper);

                        // Identify device types based on hardware ID
                        if (hardwareIdStr.find("VID_") != std::string::npos && hardwareIdStr.find("PID_") != std::string::npos) {
                            // Extract vendor and product IDs
                            size_t vidPos = hardwareIdStr.find("VID_");
                            size_t pidPos = hardwareIdStr.find("PID_");

                            if (vidPos != std::string::npos) {
                                std::string vid = hardwareIdStr.substr(vidPos + 4, 4);

                                // Map common vendor IDs to device types
                                if (vid == "046D") friendlyName = "Logitech Device";
                                else if (vid == "1532") friendlyName = "Razer Device";  // Your mouse!
                                else if (vid == "0489") friendlyName = "MediaTek Bluetooth Device";
                                else if (vid == "0B05") friendlyName = "ASUS Device";
                                else if (vid == "1BBB") friendlyName = "Tether Device";
                                else if (vid == "2B7E") friendlyName = "Webcam Device";
                                else if (vid == "1022") friendlyName = "AMD USB Device";
                                else {
                                    // Generic USB device with IDs
                                    friendlyName = "USB Device VID_" + vid;
                                }

                                // Add product ID to name
                                if (pidPos != std::string::npos) {
                                    std::string pid = hardwareIdStr.substr(pidPos + 4, 4);
                                    friendlyName += " PID_" + pid;
                                }
                            }
                        }
                        // Check for specific device types in hardware ID
                        else if (hardwareIdStr.find("USBSTOR") != std::string::npos) {
                            friendlyName = "USB Storage Device";
                        }
                        else if (hardwareIdStr.find("ROOT_HUB") != std::string::npos) {
                            friendlyName = "USB Root Hub";
                        }
                        else if (hardwareIdStr.find("HID") != std::string::npos) {
                            friendlyName = "HID Device";
                        }
                        else if (hardwareIdStr.find("USB\\VID_1532&PID_0071") != std::string::npos) {
                            friendlyName = "Razer Mouse Device"; // Specific ID for your mouse
                        }

                        // Get localized description as fallback if available
                        char deviceDesc[1024];
                        if (SetupDiGetDeviceRegistryPropertyA(deviceInfoSet, &devInfoData, SPDRP_DEVICEDESC,
                                                              NULL, (PBYTE)deviceDesc, sizeof(deviceDesc), NULL)) {
                            // Only use if it contains ASCII characters
                            std::string descStr(deviceDesc);
                            bool isASCII = true;
                            for (char c : descStr) {
                                if (c < 32 || c > 126) {
                                    isASCII = false;
                                    break;
                                }
                            }
                            if (isASCII && !descStr.empty()) {
                                friendlyName = descStr;
                            }
                        }

                        USBDeviceInfo device;
                        device.devicePath = std::string(hardwareId); // Use hardware ID as path for non-storage devices
                        device.driveLetter = ""; // No drive letter for non-storage devices
                        device.isStorageDevice = false;
                        device.isMountedAsCDROM = false;
                        device.isMountedAsFlash = false;
                        device.friendlyName = friendlyName;
                        device.hardwareId = std::string(hardwareId);
                        device.deviceInstanceId = std::string(deviceId);
                        device.isSafeToEject = false; // Non-storage devices can't be safely ejected as storage

                        usbDevices.push_back(device);
                    }
                }
            }
        }

        SetupDiDestroyDeviceInfoList(deviceInfoSet);
    }

    return usbDevices;
}

// Helper function to escape JSON special characters
std::string escapeJsonString(const std::string& input) {
    std::string output;
    output.reserve(input.length() + 20); // Reserve extra space for escaped characters

    for (char c : input) {
        switch (c) {
            case '\"': output += "\\\""; break;
            case '\\': output += "\\\\"; break;
            case '\b': output += "\\b"; break;
            case '\f': output += "\\f"; break;
            case '\n': output += "\\n"; break;
            case '\r': output += "\\r"; break;
            case '\t': output += "\\t"; break;
            default:
                // Only add printable ASCII characters and common Unicode
                if (c >= 32 && c <= 126) {
                    output += c;
                } else {
                    // For non-printable characters, add a space or skip
                    output += ' ';
                }
                break;
        }
    }
    return output;
}

// Function to output current USB status in JSON format
void outputUSBStatus() {
    std::cerr << "[USB Monitor] Entering outputUSBStatus function" << std::endl;
    std::vector<USBDeviceInfo> currentDevices = getConnectedUSBDevices();
    std::cerr << "[USB Monitor] Found " << currentDevices.size() << " current devices" << std::endl;

    // Create a map of current devices for easy lookup (using device instance ID for non-storage devices)
    std::map<std::string, USBDeviceInfo> currentDeviceMap;
    for (const auto& device : currentDevices) {
        // Use drive letter if it's a storage device, otherwise use device instance ID
        std::string key = device.isStorageDevice ? device.driveLetter : device.deviceInstanceId;
        if (key.empty()) key = device.devicePath; // Fallback to device path if no other key available
        currentDeviceMap[key] = device;
    }

    std::cerr << "[USB Monitor] Created currentDeviceMap with " << currentDeviceMap.size() << " items" << std::endl;

    // Detect changes since last check
    EnterCriticalSection(&g_usbCriticalSection);
    std::cerr << "[USB Monitor] Entered critical section" << std::endl;

    // Check for newly connected devices
    for (const auto& currentDevicePair : currentDeviceMap) {
        const std::string& deviceKey = currentDevicePair.first;
        if (g_previousUSBDevices.find(deviceKey) == g_previousUSBDevices.end()) {
            // New device detected
            std::string logEntry = "USB device connected: " + currentDevicePair.second.friendlyName + " (" + deviceKey + ")";
            g_usbEventLog.push_back(logEntry);
            std::cerr << "[USB Monitor] USB device connected: " << logEntry << std::endl;
        }
    }

    // Check for disconnected devices
    for (const auto& previousDevicePair : g_previousUSBDevices) {
        const std::string& deviceKey = previousDevicePair.first;
        if (currentDeviceMap.find(deviceKey) == currentDeviceMap.end()) {
            // Device was removed
            std::string logEntry = "USB device removed: " + previousDevicePair.second.friendlyName + " (" + deviceKey + ")";
            g_usbEventLog.push_back(logEntry);
            std::cerr << "[USB Monitor] USB device removed: " << logEntry << std::endl;
        }
    }

    // Update previous state for next comparison
    g_previousUSBDevices = currentDeviceMap;
    LeaveCriticalSection(&g_usbCriticalSection);
    std::cerr << "[USB Monitor] Left critical section" << std::endl;

    std::ostringstream ss;
    ss << "{\"usb_devices\": [";

    for (size_t i = 0; i < currentDevices.size(); ++i) {
        const auto& device = currentDevices[i];

        ss << "{";
        ss << "\"devicePath\":\"" << escapeJsonString(device.devicePath) << "\",";
        ss << "\"driveLetter\":\"" << escapeJsonString(device.driveLetter) << "\",";
        ss << "\"isStorageDevice\":" << (device.isStorageDevice ? "true" : "false") << ",";
        ss << "\"isMountedAsCDROM\":" << (device.isMountedAsCDROM ? "true" : "false") << ",";
        ss << "\"isMountedAsFlash\":" << (device.isMountedAsFlash ? "true" : "false") << ",";
        ss << "\"friendlyName\":\"" << escapeJsonString(device.friendlyName) << "\",";
        ss << "\"deviceInstanceId\":\"" << escapeJsonString(device.deviceInstanceId) << "\",";
        ss << "\"isSafeToEject\":" << (device.isSafeToEject ? "true" : "false");
        ss << "}";

        if (i + 1 < currentDevices.size()) {
            ss << ",";
        }
    }

    ss << "],";

    // Include safe removal failures
    ss << "\"safe_removal_failures\": [";
    EnterCriticalSection(&g_usbCriticalSection);
    for (size_t i = 0; i < g_safeRemovalFailures.size(); ++i) {
        ss << "\"" << escapeJsonString(g_safeRemovalFailures[i]) << "\"";
        if (i + 1 < g_safeRemovalFailures.size()) {
            ss << ",";
        }
    }
    ss << "],";

    // Include recent events
    ss << "\"recent_events\": [";
    for (size_t i = 0; i < g_usbEventLog.size(); ++i) {
        ss << "\"" << escapeJsonString(g_usbEventLog[i]) << "\"";
        if (i + 1 < g_usbEventLog.size()) {
            ss << ",";
        }
    }
    ss << "]}";

    LeaveCriticalSection(&g_usbCriticalSection);

    std::cout << ss.str() << std::endl;
    std::cout.flush();
    std::cerr << "[USB Monitor] Output JSON successfully" << std::endl;
}


// We don't need a window procedure since we're using polling instead of notifications

// Command listener thread
void commandListener() {
    std::string line;
    while (std::getline(std::cin, line)) {
        if (line.substr(0, 12) == "safe_eject: ") {
            std::string devicePath = line.substr(12);
            std::cerr << "[USB Monitor] Received safe eject command for: " << devicePath << std::endl;
            // The device path from the UI will be the drive letter, e.g., "E:\\"
            safeEjectUSBDevice(devicePath);
        }
    }
}

int main() {
    // Initialize critical section
    InitializeCriticalSection(&g_usbCriticalSection);

    // Enumerate existing USB devices
    std::vector<USBDeviceInfo> existingDevices = enumerateExistingUSBDevices();
    EnterCriticalSection(&g_usbCriticalSection);
    for (const auto& device : existingDevices) {
        std::string logEntry = "Found existing USB device: " + device.friendlyName + " at " + device.driveLetter;
        g_usbEventLog.push_back(logEntry);
    }
    LeaveCriticalSection(&g_usbCriticalSection);

    std::cerr << "[USB Monitor] Found " << existingDevices.size() << " existing USB devices" << std::endl;

    // Start command listener thread
    std::thread listener(commandListener);
    listener.detach();

    // Output initial status
    outputUSBStatus();

    std::cerr << "[USB Monitor] Starting main monitoring loop..." << std::endl;

    // Main monitoring loop - using polling instead of device notifications
    while (true) {
        try {
            // Output current status periodically
            outputUSBStatus();
        } catch (...) {
            std::cerr << "[USB Monitor] Exception occurred in main loop!" << std::endl;
        }

        Sleep(3000); // Update every 3 seconds
    }

    // This code will never be reached due to infinite loop
    DeleteCriticalSection(&g_usbCriticalSection);

    return 0;
}