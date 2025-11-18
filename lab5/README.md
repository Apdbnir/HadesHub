# Lab 5 - USB Device Monitor with Dynamic Video Backgrounds

This application monitors USB devices and changes video backgrounds based on device status.

## Features

- **Intro Video**: `5lab Intro.mp4` shown initially with "Start USB Scan" button
- **Main Video**: `5lab.mp4` during normal operation
- **Connect Video**: `5lab Conect.mp4` when device connects (3 seconds)
- **Disconnect Video**: `5lab Disconect.mp4` when device disconnects (3 seconds) 
- **Safe Removal Video**: `5lab Save.mp4` when device safely removed (3 seconds)
- Real-time USB device monitoring
- Safe USB device ejection
- Multi-language support (English/Russian)

## Required Video Files

Place these video files in the `ui/` directory:
- `5lab Intro.mp4` - Intro screen video
- `5lab.mp4` - Main operation video
- `5lab Conect.mp4` - Connection event video
- `5lab Disconect.mp4` - Disconnection event video
- `5lab Save.mp4` - Safe removal event video

## Installation and Setup

1. Navigate to the `ui` directory:
   ```bash
   cd C:\VS Code\HadesHub\lab5\ui
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the application:
   ```bash
   npm start
   ```

## How to Use

1. On startup, the intro video will play with the "Start USB Scan" button in the center
2. Click "Start USB Scan" to begin monitoring and switch to the main video
3. Connect/disconnect USB devices to see the video background change
4. Use "Safely remove" buttons to safely eject USB storage devices
5. Use the language toggle button (top-right) to switch between English/Russian

## Requirements

- Windows OS (for USB monitoring APIs)
- Node.js and npm
- g++ compiler (for building C++ backend if needed)

## Troubleshooting

- If videos don't play, make sure the required video files are in the `ui/` directory
- Some video formats may not be supported - MP4 format is recommended
- Running as administrator may be required for some USB device operations