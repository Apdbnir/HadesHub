// Simple PCI enumerator and JSON emitter for Lab2
#include "pci_codes.h"
#include <windows.h>
#include <setupapi.h>
#include <cfgmgr32.h>

#include <string>
#include <vector>
#include <iostream>
#include <sstream>
#include <thread>
#include <chrono>
#include <iomanip>

struct Device {
    std::string slot;
    std::string vid;
    std::string did;
    std::string vendor;
    std::string deviceName;
};

std::string find_vendor_name(unsigned short id) {
    // To avoid dependency on PciVenTable size in this TU, just format the vendor id as hex.
    std::ostringstream ss;
    ss << "Vendor [" << std::hex << std::uppercase << std::setw(4) << std::setfill('0') << id << "]";
    return ss.str();
}

static Device ExtractDeviceInfo(const std::wstring& hardwareId, const std::string& slotIndex, HDEVINFO deviceInfoSet, SP_DEVINFO_DATA& deviceInfoData) {
    Device d;
    d.slot = slotIndex;

    std::wstring firstId = hardwareId.c_str();
    std::string hardwareIdStr(firstId.begin(), firstId.end());
    size_t venPos = hardwareIdStr.find("VEN_");
    std::string vidHex;
    if (venPos != std::string::npos) {
        vidHex = hardwareIdStr.substr(venPos + 4, 4);
        d.vid = vidHex;
        unsigned short vidNum = (unsigned short)strtol(vidHex.c_str(), NULL, 16);
        d.vendor = find_vendor_name(vidNum);
    } else {
        d.vid = "----";
        d.vendor = "Unknown";
    }

    size_t devPos = hardwareIdStr.find("DEV_");
    if (devPos != std::string::npos) {
        d.did = hardwareIdStr.substr(devPos + 4, 4);
    } else {
        d.did = "----";
    }

    wchar_t deviceDesc[1024] = {0};
    if (SetupDiGetDeviceRegistryPropertyW(deviceInfoSet, &deviceInfoData, SPDRP_DEVICEDESC, NULL, (PBYTE)deviceDesc, sizeof(deviceDesc), NULL)) {
        std::wstring deviceDescW(deviceDesc);
        d.deviceName = std::string(deviceDescW.begin(), deviceDescW.end());
    } else {
        d.deviceName = "Unknown Device";
    }

    return d;
}

std::vector<Device> EnumeratePCIDevices()
{
    std::vector<Device> devices;
    HDEVINFO deviceInfoSet = SetupDiGetClassDevsW(
        NULL,
        L"PCI",
        NULL,
        DIGCF_PRESENT | DIGCF_ALLCLASSES);

    SP_DEVINFO_DATA deviceInfoData;
    deviceInfoData.cbSize = sizeof(SP_DEVINFO_DATA);

    DWORD deviceIndex = 0;
    while (SetupDiEnumDeviceInfo(deviceInfoSet, deviceIndex, &deviceInfoData)) {
        wchar_t hardwareId[1024] = {0};
        if (SetupDiGetDeviceRegistryPropertyW(deviceInfoSet, &deviceInfoData, SPDRP_HARDWAREID, NULL, (PBYTE)hardwareId, sizeof(hardwareId), NULL)) {
            // Use numeric index as slot when exact bus:slot not easily available
            Device d = ExtractDeviceInfo(hardwareId, std::to_string((int)deviceIndex), deviceInfoSet, deviceInfoData);
            devices.push_back(d);
        }
        deviceIndex++;
    }
    SetupDiDestroyDeviceInfoList(deviceInfoSet);

    return devices;
}

// Emit JSON to stdout periodically. Format: {"devices":[{"slot":"...","vid":"....","did":"....","vendor":"..."}, ...]}
int main(int argc, char** argv) {
    (void)argc; (void)argv;
    while (true) {
        auto devices = EnumeratePCIDevices();
        std::ostringstream ss;
        ss << "{\"devices\": [";
        for (size_t i = 0; i < devices.size(); ++i) {
            const auto &d = devices[i];
            ss << "{\"slot\":\"" << d.slot << "\",\"vid\":\"" << d.vid << "\",\"did\":\"" << d.did << "\",\"vendor\":\"" << d.vendor << "\",\"deviceName\":\"" << d.deviceName << "\"}";
            if (i + 1 < devices.size()) ss << ",";
        }
        ss << "]}";
        std::string out = ss.str();
        std::cout << out << std::endl;
        std::cout.flush();
        std::this_thread::sleep_for(std::chrono::seconds(3));
    }
    return 0;
}
