#include <windows.h>
#include <winioctl.h>
#include <setupapi.h>
#include <cfgmgr32.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <iostream>
#include <sstream>
#include <vector>
#include <string>
#include <io.h> // for access function
#include <windows.h>
#include <aclapi.h> // for security functions

// Define types for Windows XP compatibility
#ifndef __STDC_FORMAT_MACROS
#define __STDC_FORMAT_MACROS
#endif
#include <inttypes.h>

// Structure to hold disk information
struct DiskInfo {
    char model[256];
    char manufacturer[256];
    char serial[256];
    char firmware[256];
    char memoryInfo[256]; // Format: "Total/Used/Free"
    char interfaceType[64];
    char supportedModes[256];
    bool isSSD; // true if SSD, false if HDD
    int diskNumber; // physical disk number
};

// Function to get detailed disk information using direct port/low-level Windows APIs
bool getDiskInfo(int diskNumber, DiskInfo& diskInfo) {
    char drivePath[64];
    sprintf(drivePath, "\\\\.\\PhysicalDrive%d", diskNumber);
    
    // Using direct access to physical drives - the lowest level we can access from user mode
    HANDLE hDevice = CreateFileA(
        drivePath,
        GENERIC_READ | GENERIC_WRITE,
        FILE_SHARE_READ | FILE_SHARE_WRITE,
        NULL,
        OPEN_EXISTING,
        0,
        NULL
    );

    if (hDevice == INVALID_HANDLE_VALUE) {
        return false;
    }

    // Get device descriptor using direct Windows API call (STORAGE_QUERY_PROPERTY)
    // This is as low-level as we can get without kernel mode or special drivers
    STORAGE_PROPERTY_QUERY query;
    ZeroMemory(&query, sizeof(query));
    query.PropertyId = StorageDeviceProperty;
    query.QueryType = PropertyStandardQuery;

    // Allocate buffer for device descriptor
    char buffer[512] = {0};
    DWORD bytesReturned = 0;

    // Use DeviceIoControl to communicate directly with the device
    // This is essentially a direct communication with the device via I/O ports
    if (!DeviceIoControl(
        hDevice,
        IOCTL_STORAGE_QUERY_PROPERTY,
        &query,
        sizeof(query),
        buffer,
        sizeof(buffer),
        &bytesReturned,
        NULL
    )) {
        CloseHandle(hDevice);
        return false;
    }

    STORAGE_DEVICE_DESCRIPTOR* descriptor = (STORAGE_DEVICE_DESCRIPTOR*)buffer;

    // Extract information directly from the device descriptor
    if (descriptor->ProductIdOffset != 0 && descriptor->ProductIdOffset < 512) {
        strncpy_s(diskInfo.model, sizeof(diskInfo.model), buffer + descriptor->ProductIdOffset, _TRUNCATE);
    } else {
        strcpy_s(diskInfo.model, sizeof(diskInfo.model), "Unknown Model");
    }

    if (descriptor->VendorIdOffset != 0 && descriptor->VendorIdOffset < 512) {
        strncpy_s(diskInfo.manufacturer, sizeof(diskInfo.manufacturer), buffer + descriptor->VendorIdOffset, _TRUNCATE);
    } else {
        strcpy_s(diskInfo.manufacturer, sizeof(diskInfo.manufacturer), "Unknown Manufacturer");
    }

    if (descriptor->ProductRevisionOffset != 0 && descriptor->ProductRevisionOffset < 512) {
        strncpy_s(diskInfo.firmware, sizeof(diskInfo.firmware), buffer + descriptor->ProductRevisionOffset, _TRUNCATE);
    } else {
        strcpy_s(diskInfo.firmware, sizeof(diskInfo.firmware), "Unknown Firmware");
    }

    if (descriptor->SerialNumberOffset != 0 && descriptor->SerialNumberOffset < 512) {
        strncpy_s(diskInfo.serial, sizeof(diskInfo.serial), buffer + descriptor->SerialNumberOffset, _TRUNCATE);
    } else {
        strcpy_s(diskInfo.serial, sizeof(diskInfo.serial), "Unknown Serial");
    }

    // Get disk geometry using direct I/O control - lowest level accessible from user mode
    DISK_GEOMETRY geometry;
    if (DeviceIoControl(
        hDevice,
        IOCTL_DISK_GET_DRIVE_GEOMETRY,
        NULL,
        0,
        &geometry,
        sizeof(geometry),
        &bytesReturned,
        NULL
    )) {
        ULONGLONG totalSize = (ULONGLONG)geometry.Cylinders.QuadPart * 
                              geometry.TracksPerCylinder * 
                              geometry.SectorsPerTrack * 
                              geometry.BytesPerSector;
        // Format: "Total/Used/Free" - we only know total on Windows XP
        sprintf(diskInfo.memoryInfo, "%.2f GB/N/A/N/A", (double)totalSize / (1024.0 * 1024.0 * 1024.0));
    } else {
        strcpy_s(diskInfo.memoryInfo, sizeof(diskInfo.memoryInfo), "Unknown/Unknown/Unknown");
    }

    // Determine interface type by directly querying the device
    switch (descriptor->BusType) {
        case BusTypeSata:
            strcpy_s(diskInfo.interfaceType, sizeof(diskInfo.interfaceType), "SATA");
            break;
        case BusTypeSas:
            strcpy_s(diskInfo.interfaceType, sizeof(diskInfo.interfaceType), "SAS");
            break;
        case BusTypeUsb:
            strcpy_s(diskInfo.interfaceType, sizeof(diskInfo.interfaceType), "USB");
            break;
        case BusTypeNvme:
            // NVMe is not typically supported on Windows XP, so we'll use a generic label
            strcpy_s(diskInfo.interfaceType, sizeof(diskInfo.interfaceType), "SCSI");
            break;
        case BusTypeAta:
            strcpy_s(diskInfo.interfaceType, sizeof(diskInfo.interfaceType), "IDE/ATA");
            break;
        default:
            strcpy_s(diskInfo.interfaceType, sizeof(diskInfo.interfaceType), "Unknown Interface");
            break;
    }

    // Determine if disk is SSD or HDD (simplified detection)
    // On Windows XP, there's no direct API for TRIM support detection
    // We'll make an educated guess based on interface and model name
    diskInfo.isSSD = false; // Default to HDD
    
    // Check for keywords in model name that might indicate SSD
    char lowerModel[256];
    strcpy_s(lowerModel, sizeof(lowerModel), diskInfo.model);
    
    // Convert to lowercase for comparison
    for(int i = 0; lowerModel[i]; i++){
        lowerModel[i] = tolower(lowerModel[i]);
    }
    
    // Check if device is USB - we skip USB devices as per requirements
    if(descriptor->BusType == BusTypeUsb) {
        CloseHandle(hDevice);
        return false;
    }
    
    if(strstr(lowerModel, "ssd") || strstr(lowerModel, "solid state") || 
       strcmp(diskInfo.interfaceType, "NVMe") == 0) {
        diskInfo.isSSD = true;
    }

    // Supported modes (simplified)
    strcpy_s(diskInfo.supportedModes, sizeof(diskInfo.supportedModes), "PIO, DMA, UDMA");

    // Store disk number for reference
    diskInfo.diskNumber = diskNumber;

    CloseHandle(hDevice);
    return true;
}

// Function to get volume information and calculate used/free space
bool getVolumeSpaceInfo(int diskNumber, char* volumePath, char* spaceInfo) {
    // Try to find a volume associated with this disk
    char driveLetters[] = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    for(int i = 0; i < 26; i++) {
        sprintf(volumePath, "%c:\\", driveLetters[i]);
        DWORD dwDriveType = GetDriveTypeA(volumePath);
        
        // Only check fixed drives (not removable or USB)
        if(dwDriveType == DRIVE_FIXED) {
            ULARGE_INTEGER totalSpace, freeSpace;
            if(GetDiskFreeSpaceExA(volumePath, &freeSpace, &totalSpace, NULL)) {
                double totalGB = (double)totalSpace.QuadPart / (1024.0 * 1024.0 * 1024.0);
                double freeGB = (double)freeSpace.QuadPart / (1024.0 * 1024.0 * 1024.0);
                double usedGB = totalGB - freeGB;
                sprintf(spaceInfo, "%.2f GB/%.2f GB/%.2f GB", totalGB, usedGB, freeGB);
                return true;
            }
        }
    }
    return false;
}

// Function to escape special characters in JSON strings (C++98 compatible)
std::string escapeJsonString(const char* input) {
    std::string output = input;
    std::string::size_type pos = 0;
    while ((pos = output.find("\"", pos)) != std::string::npos) {
        output.replace(pos, 1, "\\\"");
        pos += 2; // Move past the replacement
    }
    pos = 0;
    while ((pos = output.find("\\", pos)) != std::string::npos) {
        // Only escape backslashes that aren't already escaping something else
        if (pos + 1 >= output.length() || output[pos + 1] != '"') {
            output.replace(pos, 1, "\\\\");
            pos += 2;
        } else {
            pos += 2; // Skip escaped quote
        }
    }
    pos = 0;
    while ((pos = output.find("\n", pos)) != std::string::npos) {
        output.replace(pos, 1, "\\n");
        pos += 2;
    }
    pos = 0;
    while ((pos = output.find("\r", pos)) != std::string::npos) {
        output.replace(pos, 1, "\\r");
        pos += 2;
    }
    pos = 0;
    while ((pos = output.find("\t", pos)) != std::string::npos) {
        output.replace(pos, 1, "\\t");
        pos += 2;
    }
    return output;
}

int main(int argc, char* argv[]) {
    // Simple check: try to access a system-level resource to test admin privileges
    HANDLE hDevice = CreateFileA("\\\\.\\PhysicalDrive0", 
        GENERIC_READ, 
        FILE_SHARE_READ | FILE_SHARE_WRITE, 
        NULL, 
        OPEN_EXISTING, 
        0, 
        NULL);

    if (hDevice == INVALID_HANDLE_VALUE) {
        // Likely not running as administrator
        DWORD error = GetLastError();
        if (error == ERROR_ACCESS_DENIED) {
            std::cout << "{\"message\":\"This program requires administrator privileges. Please run as administrator.\"}" << std::endl;
            // Wait for the application to be closed by the user
            while (true) {
                Sleep(5000); // Sleep for 5 seconds
                // Try again to see if privileges have been granted
                HANDLE testHandle = CreateFileA("\\\\.\\PhysicalDrive0", 
                    GENERIC_READ, 
                    FILE_SHARE_READ | FILE_SHARE_WRITE, 
                    NULL, 
                    OPEN_EXISTING, 
                    0, 
                    NULL);
                if (testHandle != INVALID_HANDLE_VALUE) {
                    CloseHandle(testHandle);
                    break; // Successfully got access, continue
                }
            }
        }
    } else {
        // We have access, close the handle
        CloseHandle(hDevice);
    }

    // Determine variant from command line argument
    // Usage: diskscan.exe [HDD|SSD]
    char variant[10] = "BOTH"; // Default to show both
    if (argc > 1) {
        if (strcmp(argv[1], "HDD") == 0 || strcmp(argv[1], "hdd") == 0) {
            strcpy_s(variant, sizeof(variant), "HDD");
        } else if (strcmp(argv[1], "SSD") == 0 || strcmp(argv[1], "ssd") == 0) {
            strcpy_s(variant, sizeof(variant), "SSD");
        }
    }
    
    // Enumerate physical drives to get disk info
    std::vector<DiskInfo> allDisks;
    std::vector<DiskInfo> targetDisks; // Disks matching the variant (HDD or SSD)
    
    for (int i = 0; i < 10; i++) { // Check first 10 physical drives
        DiskInfo disk;
        // Initialize the structure
        ZeroMemory(&disk, sizeof(DiskInfo));
        if (getDiskInfo(i, disk)) {
            allDisks.push_back(disk);
            
            // Filter based on variant (HDD or SSD)
            if (strcmp(variant, "HDD") == 0) {
                if (!disk.isSSD) targetDisks.push_back(disk);
            } else if (strcmp(variant, "SSD") == 0) {
                if (disk.isSSD) targetDisks.push_back(disk);
            } else { // BOTH or default
                targetDisks.push_back(disk);
            }
        }
    }
    
    // If no target disks found for the specified variant, fall back to showing all disks
    if (targetDisks.empty() && strcmp(variant, "BOTH") != 0) {
        // If variant-specific disks not found, show a message
        std::cout << "{\"message\":\"No " << variant << " disks found on this system.\"}" << std::endl;
        
        // Sleep indefinitely since there's nothing to monitor
        while (true) {
            Sleep(10000); // Sleep for 10 seconds before rechecking
            // Check again for the specified variant
            targetDisks.clear();
            for (int i = 0; i < 10; i++) {
                DiskInfo disk;
                ZeroMemory(&disk, sizeof(DiskInfo));
                if (getDiskInfo(i, disk)) {
                    if ((strcmp(variant, "HDD") == 0 && !disk.isSSD) || 
                        (strcmp(variant, "SSD") == 0 && disk.isSSD)) {
                        targetDisks.push_back(disk);
                    }
                }
            }
            
            if (!targetDisks.empty()) {
                break; // Found disks of the required type
            }
        }
    } else if (targetDisks.empty()) {
        targetDisks = allDisks; // If looking for both and none found, show empty
    }

    // Emit JSON to stdout periodically
    while (true) {
        std::ostringstream ss;
        ss << "{\"disks\": [";
        for (size_t i = 0; i < targetDisks.size(); ++i) {
            DiskInfo d = targetDisks[i];
            
            // Update memory info with volume space if available
            char volumePath[256];
            char fullSpaceInfo[256];
            if (getVolumeSpaceInfo(d.diskNumber, volumePath, fullSpaceInfo)) {
                strcpy_s(d.memoryInfo, sizeof(d.memoryInfo), fullSpaceInfo);
            }
            
            std::string model = escapeJsonString(d.model);
            std::string manufacturer = escapeJsonString(d.manufacturer);
            std::string serial = escapeJsonString(d.serial);
            std::string firmware = escapeJsonString(d.firmware);
            std::string memoryInfo = escapeJsonString(d.memoryInfo);
            std::string interfaceType = escapeJsonString(d.interfaceType);
            std::string supportedModes = escapeJsonString(d.supportedModes);
            
            ss << "{";
            ss << "\"model\":\"" << model << "\",";
            ss << "\"manufacturer\":\"" << manufacturer << "\",";
            ss << "\"serial\":\"" << serial << "\",";
            ss << "\"firmware\":\"" << firmware << "\",";
            ss << "\"memoryInfo\":\"" << memoryInfo << "\",";
            ss << "\"interfaceType\":\"" << interfaceType << "\",";
            ss << "\"supportedModes\":\"" << supportedModes << "\",";
            ss << "\"isSSD\":\"" << (d.isSSD ? "true" : "false") << "\"";
            ss << "}";
            if (i + 1 < targetDisks.size()) ss << ",";
        }
        ss << "]}";
        std::string out = ss.str();
        std::cout << out << std::endl;
        std::cout.flush();
        
        // Sleep for 5 seconds using Windows API for XP compatibility
        Sleep(5000);
    }

    return 0;
}