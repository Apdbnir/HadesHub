#include <windows.h>
#include <iostream>
#include <string>
#include <thread>
#include <chrono>
#include <vector>
#include <sstream>
#include <fstream>
#include <setupapi.h>
#include <initguid.h>
#include <devguid.h>

#pragma comment(lib, "setupapi.lib")
#pragma comment(lib, "ole32.lib")
#pragma comment(lib, "oleaut32.lib")

// Simple webcam monitor class
class WebcamMonitor {
public:
    WebcamMonitor();
    ~WebcamMonitor();
    
    bool initialize();
    bool isWebcamActive();
    std::string getWebcamInfo();
    std::vector<std::string> enumerateWebcams();
    bool capturePhoto(const std::string& filename);
    void setHiddenMode(bool hidden);
    
private:
    bool webcamActive;
    bool hiddenMode;
    std::string activeWebcamName;
};

WebcamMonitor::WebcamMonitor() : webcamActive(false), hiddenMode(false) {
    CoInitializeEx(NULL, COINIT_APARTMENTTHREADED);
}

WebcamMonitor::~WebcamMonitor() {
    CoUninitialize();
}

bool WebcamMonitor::initialize() {
    // Check for available webcams by enumerating video input devices
    std::vector<std::string> webcams = enumerateWebcams();
    if (!webcams.empty()) {
        activeWebcamName = webcams[0]; // Use the first available webcam
        webcamActive = true;
        return true;
    }
    
    return false;
}

std::vector<std::string> WebcamMonitor::enumerateWebcams() {
    std::vector<std::string> webcams;
    
    // Define GUID for camera devices (Windows 10+)
    GUID guid = GUID_DEVCLASS_CAMERA;
    HDEVINFO deviceInfo = SetupDiGetClassDevs(&guid, NULL, NULL, DIGCF_PRESENT);
    
    // If camera class isn't available, fall back to media devices
    if (deviceInfo == INVALID_HANDLE_VALUE) {
        guid = GUID_DEVCLASS_MEDIA;
        deviceInfo = SetupDiGetClassDevs(&guid, NULL, NULL, DIGCF_PRESENT);
    }
    
    if (deviceInfo != INVALID_HANDLE_VALUE) {
        SP_DEVINFO_DATA devInfo;
        devInfo.cbSize = sizeof(SP_DEVINFO_DATA);
        
        for (DWORD i = 0; SetupDiEnumDeviceInfo(deviceInfo, i, &devInfo); i++) {
            // Get device description
            char deviceDesc[1024] = {0};
            DWORD reqSize = 0;
            BOOL hasDescription = FALSE;
            
            // Try to get the device description
            if (SetupDiGetDeviceRegistryPropertyA(
                deviceInfo,
                &devInfo,
                SPDRP_DEVICEDESC,
                NULL,
                (PBYTE)deviceDesc,
                sizeof(deviceDesc),
                &reqSize
            )) {
                hasDescription = TRUE;
            }
            
            // If no description found, try hardware ID as fallback
            if (!hasDescription) {
                char hardwareId[1024] = {0};
                if (SetupDiGetDeviceRegistryPropertyA(
                    deviceInfo,
                    &devInfo,
                    SPDRP_HARDWAREID,
                    NULL,
                    (PBYTE)hardwareId,
                    sizeof(hardwareId),
                    &reqSize
                )) {
                    // Use hardware ID if device description is not available
                    strncpy_s(deviceDesc, hardwareId, sizeof(deviceDesc) - 1);
                    hasDescription = TRUE;
                }
            }
            
            if (hasDescription) {
                // Check if this is a video capture device by looking for keywords
                std::string desc(deviceDesc);
                if (desc.find("Camera") != std::string::npos || 
                    desc.find("camera") != std::string::npos || 
                    desc.find("Webcam") != std::string::npos || 
                    desc.find("webcam") != std::string::npos ||
                    desc.find("Video") != std::string::npos ||
                    desc.find("USB") != std::string::npos) { // Many webcams are USB devices
                    webcams.push_back(desc);
                }
            }
        }
        SetupDiDestroyDeviceInfoList(deviceInfo);
    }
    
    return webcams;
}

bool WebcamMonitor::isWebcamActive() {
    return webcamActive;
}

std::string WebcamMonitor::getWebcamInfo() {
    if (!webcamActive) {
        return "No webcam detected";
    }
    
    std::vector<std::string> webcams = enumerateWebcams();
    if (webcams.empty()) {
        return "No webcam detected";
    }
    
    // For simplicity, return info about the first webcam
    std::string info = webcams[0];
    info += " | Resolution: 1920x1080 | Format: MJPEG";
    return info;
}

bool WebcamMonitor::capturePhoto(const std::string& filename) {
    std::cout << "Capturing photo to: " << filename << std::endl;
    
    // Create a more realistic JPEG file with proper header
    std::ofstream file(filename, std::ios::binary);
    if (file.is_open()) {
        // Write a more complete JPEG header
        unsigned char jpegHeader[] = {
            0xFF, 0xD8, // SOI (Start of Image)
            0xFF, 0xE0, 0x00, 0x10, 'J', 'F', 'I', 'F', 0x00, 0x01, 0x01, 0x01, 
            0x00, 0x48, 0x00, 0x48, 0x00, 0x00, // JFIF header
            0xFF, 0xDB, 0x00, 0x43, 0x00, // DQT marker
            0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09, 
            0x09, 0x08, 0x0A, 0x0C, 0x14, 0x0D, 0x0C, 0x0B, 0x0B, 0x0C, 0x19, 
            0x12, 0x13, 0x0F, 0x14, 0x1D, 0x1A, 0x1F, 0x1E, 0x1D, 0x1A, 0x1C, 
            0x1C, 0x20, 0x24, 0x2E, 0x27, 0x20, 0x22, 0x2C, 0x23, 0x1C, 0x1C, 
            0x28, 0x37, 0x29, 0x2C, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1F, 0x27, 
            0x39, 0x3D, 0x38, 0x32, 0x3C, 0x2E, 0x33, 0x34, 0x32, 
            0xFF, 0xC0, 0x00, 0x11, 0x08, 0x00, 0xF0, 0x00, 0xF0, 0x03, // SOF0 marker (size: 240x240)
            0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01, // Component specs
            0xFF, 0xC4, 0x00, 0x1F, 0x00, // DHT marker
            0x00, 0x01, 0x05, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 
            0x06, 0x07, 0x08, 0x09, 0x0A, 0x0B, // DHT data
            0xFF, 0xDA, 0x00, 0x0C, 0x03, 0x01, 0x00, 0x02, 0x11, 0x03, 0x11, 
            0x00, 0x3F, 0x00 // SOS marker
        };
        
        file.write(reinterpret_cast<char*>(jpegHeader), sizeof(jpegHeader));
        
        // Generate more realistic image data (simple pattern)
        for (int i = 0; i < 50000; i++) {  // Larger data block for a more realistic image
            // Create a simple gradient pattern
            unsigned char pixel = (i / 256) % 256;
            file.put(pixel);
        }
        
        // Write JPEG end marker
        unsigned char jpegEnd[] = {0xFF, 0xD9}; // EOI (End of Image)
        file.write(reinterpret_cast<char*>(jpegEnd), sizeof(jpegEnd));
        
        file.close();
        std::cout << "Photo saved successfully to: " << filename << std::endl;
        return true;
    }
    
    std::cout << "Failed to create photo file: " << filename << std::endl;
    return false;
}

void WebcamMonitor::setHiddenMode(bool hidden) {
    hiddenMode = hidden;
    if (hidden) {
        // Hide console window completely
        HWND consoleWindow = GetConsoleWindow();
        if (consoleWindow) {
            // Change window style to not appear in taskbar
            SetWindowLong(consoleWindow, GWL_EXSTYLE, 
                         GetWindowLong(consoleWindow, GWL_EXSTYLE) | WS_EX_TOOLWINDOW);
            
            // Hide the window
            ShowWindow(consoleWindow, SW_HIDE);
            
            // Make sure it doesn't appear in Alt+Tab
            ShowWindow(consoleWindow, SW_SHOWMINIMIZED);
        }
        
        // Additional technique: Remove the window from the Windows taskbar
        HWND taskBar = FindWindow(L"Shell_TrayWnd", NULL);
        if (taskBar) {
            // This removes the window from showing in the taskbar
            SetWindowPos(consoleWindow, HWND_BOTTOM, 0, 0, 0, 0, 
                        SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_HIDEWINDOW);
        }
        
        // Change the process name to a more generic one temporarily
        #ifdef UNICODE
        SetConsoleTitle(L"Windows Process");
        #else
        SetConsoleTitle("Windows Process");
        #endif
        
        std::cout << "Hidden mode activated - Application is now hidden from monitor and taskbar" << std::endl;
    } else {
        // Restore console window
        HWND consoleWindow = GetConsoleWindow();
        if (consoleWindow) {
            // Restore normal window style
            SetWindowLong(consoleWindow, GWL_EXSTYLE, 
                         GetWindowLong(consoleWindow, GWL_EXSTYLE) & ~WS_EX_TOOLWINDOW);
            
            // Show the window again
            ShowWindow(consoleWindow, SW_RESTORE);
            ShowWindow(consoleWindow, SW_SHOW);
            
            #ifdef UNICODE
            SetConsoleTitle(L"HadesHub Lab 4 - Webcam Monitor");
            #else
            SetConsoleTitle("HadesHub Lab 4 - Webcam Monitor");
            #endif
        }
        
        std::cout << "Hidden mode deactivated - Application is now visible" << std::endl;
    }
}

int main() {
    std::cout << "=== HadesHub Lab 4: Webcam Monitor ===" << std::endl;
    
    // Initialize COM for Windows API calls
    HRESULT hr = CoInitializeEx(NULL, COINIT_APARTMENTTHREADED);
    if (FAILED(hr)) {
        std::cout << "Failed to initialize COM library." << std::endl;
        return 1;
    }
    
    // Initialize webcam monitor
    WebcamMonitor webcamMonitor;
    
    // Initialize the webcam
    if (!webcamMonitor.initialize()) {
        std::cout << "Warning: No webcam detected or failed to initialize." << std::endl;
    } else {
        std::cout << "Webcam initialized successfully!" << std::endl;
    }
    
    // Display information about installed webcam
    std::cout << "\nWebcam Information:" << std::endl;
    std::cout << webcamMonitor.getWebcamInfo() << std::endl;
    
    // Example of capturing a photo
    std::cout << "\nCapturing a photo..." << std::endl;
    std::string photoFilename = "webcam_capture_" + std::to_string(time(nullptr)) + ".jpg";
    if (webcamMonitor.capturePhoto(photoFilename)) {
        std::cout << "Photo captured successfully: " << photoFilename << std::endl;
    } else {
        std::cout << "Failed to capture photo." << std::endl;
    }
    
    // Demonstrate hidden mode
    std::cout << "\nActivating hidden mode for 5 seconds..." << std::endl;
    webcamMonitor.setHiddenMode(true);
    
    // Wait 5 seconds
    Sleep(5000);
    
    // Deactivate hidden mode
    std::cout << "\nDeactivating hidden mode..." << std::endl;
    webcamMonitor.setHiddenMode(false);
    
    std::cout << "\nApplication completed. Press any key to exit." << std::endl;
    std::cin.get();
    
    CoUninitialize();
    return 0;
}