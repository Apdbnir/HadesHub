#include <windows.h>
#include <winioctl.h>
#include <stdio.h>
#include <stdlib.h>
#include <string>
#include <iostream>
#include <sstream>
#include <vector>
#include <thread>
#include <chrono>
#include <iomanip>

// Structure to hold disk information
struct DiskInfo {
    std::string model;
    std::string manufacturer;
    std::string serial;
    std::string firmware;
    std::string memoryInfo; // Format: "Total/Used/Free"
    std::string interfaceType;
    std::string supportedModes;
};

// Function to get disk information using IOCTL
bool getDiskInfo(int diskNumber, DiskInfo& diskInfo) {
    std::string drivePath = "\\\\.\\PhysicalDrive" + std::to_string(diskNumber);
    HANDLE hDevice = CreateFileA(
        drivePath.c_str(),
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

    // Get device descriptor
    STORAGE_PROPERTY_QUERY query;
    query.PropertyId = StorageDeviceProperty;
    query.QueryType = PropertyStandardQuery;

    char buffer[512] = {0};
    DWORD bytesReturned;

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

    // Extract information from the descriptor
    if (descriptor->ProductIdOffset != 0) {
        diskInfo.model = buffer + descriptor->ProductIdOffset;
    } else {
        diskInfo.model = "Unknown Model";
    }

    if (descriptor->VendorIdOffset != 0) {
        diskInfo.manufacturer = buffer + descriptor->VendorIdOffset;
    } else {
        diskInfo.manufacturer = "Unknown Manufacturer";
    }

    if (descriptor->ProductRevisionOffset != 0) {
        diskInfo.firmware = buffer + descriptor->ProductRevisionOffset;
    } else {
        diskInfo.firmware = "Unknown Firmware";
    }

    if (descriptor->SerialNumberOffset != 0) {
        diskInfo.serial = buffer + descriptor->SerialNumberOffset;
    } else {
        diskInfo.serial = "Unknown Serial";
    }

    // Get disk geometry to calculate size
    DISK_GEOMETRY_EX geometry;
    if (DeviceIoControl(
        hDevice,
        IOCTL_DISK_GET_DRIVE_GEOMETRY_EX,
        NULL,
        0,
        &geometry,
        sizeof(geometry),
        &bytesReturned,
        NULL
    )) {
        ULONGLONG totalSize = geometry.DiskSize.QuadPart;
        std::stringstream ss;
        ss << std::fixed << std::setprecision(2);
        ss << (double)totalSize / (1024.0 * 1024.0 * 1024.0) << " GB";
        diskInfo.memoryInfo = ss.str() + "/N/A/N/A"; // Total/Used/Free
    } else {
        diskInfo.memoryInfo = "Unknown/Unknown/Unknown";
    }

    // Determine interface type
    switch (descriptor->BusType) {
        case BusTypeSata:
            diskInfo.interfaceType = "SATA";
            break;
        case BusTypeSas:
            diskInfo.interfaceType = "SAS";
            break;
        case BusTypeUsb:
            diskInfo.interfaceType = "USB";
            break;
        case BusTypeNvme:
            diskInfo.interfaceType = "NVMe";
            break;
        case BusTypeAta:
            diskInfo.interfaceType = "IDE/ATA";
            break;
        default:
            diskInfo.interfaceType = "Unknown Interface";
            break;
    }

    // Supported modes (simplified)
    diskInfo.supportedModes = "PIO, DMA, UDMA, SATA3";

    CloseHandle(hDevice);
    return true;
}

int main() {
    // Enumerate physical drives to get disk info
    std::vector<DiskInfo> disks;
    
    for (int i = 0; i < 10; i++) { // Check first 10 physical drives
        DiskInfo disk;
        if (getDiskInfo(i, disk)) {
            // Filter for HDD or SSD based on model name or other characteristics
            // For simplicity, we'll include all disks, but in a real implementation
            // we would determine if this disk is HDD or SSD
            disks.push_back(disk);
        }
    }

    // Emit JSON to stdout periodically
    while (true) {
        std::ostringstream ss;
        ss << "{\"disks\": [";
        for (size_t i = 0; i < disks.size(); ++i) {
            const auto &d = disks[i];
            ss << "{";
            ss << "\"model\":\"" << d.model << "\",";
            ss << "\"manufacturer\":\"" << d.manufacturer << "\",";
            ss << "\"serial\":\"" << d.serial << "\",";
            ss << "\"firmware\":\"" << d.firmware << "\",";
            ss << "\"memoryInfo\":\"" << d.memoryInfo << "\",";
            ss << "\"interfaceType\":\"" << d.interfaceType << "\",";
            ss << "\"supportedModes\":\"" << d.supportedModes << "\"";
            ss << "}";
            if (i + 1 < disks.size()) ss << ",";
        }
        ss << "]}";
        std::string out = ss.str();
        std::cout << out << std::endl;
        std::cout.flush();
        std::this_thread::sleep_for(std::chrono::seconds(5)); // Refresh every 5 seconds
    }

    return 0;
}