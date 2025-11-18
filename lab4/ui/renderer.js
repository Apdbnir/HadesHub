document.addEventListener('DOMContentLoaded', function() {
    // Load translations
    loadTranslations();

    // Get video background elements
    const videoBgIntro = document.getElementById('video-bg-intro');
    const videoBgMain = document.getElementById('video-bg-main');
    const videoBgPhoto = document.getElementById('video-bg-photo');

    // Set initial background for intro screen
    videoBgIntro.style.display = 'block';
    videoBgMain.style.display = 'none';
    videoBgPhoto.style.display = 'none';

    // Get DOM elements
    const startBtn = document.getElementById('start-btn');
    const startScreen = document.getElementById('start-screen');
    const mainContent = document.getElementById('main-content');
    const webcamStatus = document.getElementById('webcam-status');
    const webcamInfo = document.getElementById('webcam-info');
    const recordingStatus = document.getElementById('recording-status');
    const hiddenMode = document.getElementById('hidden-mode');
    const capturePhotoBtn = document.getElementById('capture-photo-btn');
    const toggleHiddenBtn = document.getElementById('toggle-hidden-btn');
    const webcamPreview = document.getElementById('webcam-preview');
    const langBtn = document.querySelector('.lang-btn');

    // State variables
    let isMonitoring = false;
    let isHiddenMode = false;
    let stream = null;
    let currentCameraId = null;

    // Get additional elements
    const refreshCameraInfoBtn = document.getElementById('refresh-camera-info');

    // Add event listener for camera info refresh
    refreshCameraInfoBtn.addEventListener('click', async function() {
        await getCameraInfo();
    });

    // Start monitoring button
    startBtn.addEventListener('click', async function() {
        startScreen.style.display = 'none';
        mainContent.style.display = 'block';

        // Change background to main application background
        videoBgIntro.style.display = 'none';
        videoBgMain.style.display = 'block';
        videoBgPhoto.style.display = 'none';

        // Initialize monitoring with actual camera access
        await initializeMonitoring();
    });

    // Capture photo button
    capturePhotoBtn.addEventListener('click', function() {
        capturePhoto();
    });

    // Toggle hidden mode button
    toggleHiddenBtn.addEventListener('click', function() {
        toggleHiddenMode();
    });

    // Additional function to update dynamic content based on language
    function updateDynamicContent() {
        const lang = localStorage.getItem('lang') || 'en';

        // Update refresh button text
        const refreshBtn = document.getElementById('refresh-camera-info');
        if (refreshBtn) {
            const refreshText = lang === 'en' ? 'Refresh' : 'Обновить';
            refreshBtn.textContent = refreshText;
        }

        // Update language button text
        if (langBtn) {
            langBtn.textContent = lang.toUpperCase();
        }
    }

    // Language switcher
    langBtn.addEventListener('click', function() {
        const currentLang = localStorage.getItem('lang') || 'en';
        const newLang = currentLang === 'en' ? 'ru' : 'en';
        localStorage.setItem('lang', newLang);
        loadTranslations();
        updateDynamicContent();
        updateStatus(); // Update status texts that are set dynamically
    });

    // Initialize dynamic content after translations are loaded
    updateDynamicContent();

    async function initializeMonitoring() {
        try {
            // Request access to the camera
            const constraints = {
                video: {
                    facingMode: 'user',
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                },
                audio: false
            };

            stream = await navigator.mediaDevices.getUserMedia(constraints);
            webcamPreview.srcObject = stream;

            // Update status
            const lang = localStorage.getItem('lang') || 'en';
            webcamStatus.textContent = lang === 'en' ? 'Active' : 'Активна';
            webcamStatus.style.color = 'lightgreen';

            // Get camera information
            await getCameraInfo();

            isMonitoring = true;
            recordingStatus.textContent = lang === 'en' ? 'Not recording' : 'Не записывается';
            recordingStatus.style.color = 'orange';

        } catch (error) {
            console.error('Error accessing camera:', error);
            const lang = localStorage.getItem('lang') || 'en';
            const errorMsg = lang === 'en' ? 'Error: ' : 'Ошибка: ';
            webcamStatus.textContent = errorMsg + error.message;
            webcamStatus.style.color = 'red';
            const alertMsg = lang === 'en' ? 'Could not access camera: ' : 'Не удалось получить доступ к камере: ';
            alert(alertMsg + error.message);
        }

        // Update status regularly
        setInterval(updateStatus, 2000);

        // Update camera info regularly (every 10 seconds) as properties might change
        setInterval(async () => {
            if (webcamInfo && stream) {
                // Only update if the webcam-info element is visible and we have an active stream
                await getCameraInfo();
            }
        }, 10000);
    }

    async function getCameraInfo() {
        try {
            const lang = localStorage.getItem('lang') || 'en';

            const devices = await navigator.mediaDevices.enumerateDevices();
            const videoDevices = devices.filter(device => device.kind === 'videoinput');

            if (videoDevices.length > 0) {
                let info = '';

                // For each camera device, try to get more detailed information
                for (let i = 0; i < videoDevices.length; i++) {
                    const device = videoDevices[i];
                    const cameraText = lang === 'en' ? `Camera ${i + 1}:` : `Камера ${i + 1}:`;
                    info += `<h4>${cameraText} ${device.label || (lang === 'en' ? 'Unknown' : 'Неизвестно')}</h4>`;
                    const idText = lang === 'en' ? 'ID:' : 'ID:';
                    info += `<p><b>${idText}</b> ${device.deviceId}</p>`;

                    // Try to get additional constraints for this device
                    try {
                        // Create a temporary stream to get more detailed capabilities
                        const tempStream = await navigator.mediaDevices.getUserMedia({
                            video: {
                                deviceId: device.deviceId,
                                width: { ideal: 1280 },
                                height: { ideal: 720 }
                            }
                        });

                        const videoTrack = tempStream.getVideoTracks()[0];
                        const capabilities = videoTrack.getCapabilities ? videoTrack.getCapabilities() : null;
                        const settings = videoTrack.getSettings ? videoTrack.getSettings() : null;

                        // Display current settings
                        if (settings) {
                            const resolutionText = lang === 'en' ? 'Current resolution:' : 'Текущее разрешение:';
                            const aspectRatioText = lang === 'en' ? 'Aspect ratio:' : 'Соотношение сторон:';
                            const frameRateText = lang === 'en' ? 'Frame rate:' : 'Частота кадров:';
                            const imageFormatText = lang === 'en' ? 'Image format:' : 'Формат изображения:';
                            const unknownText = lang === 'en' ? 'Unknown' : 'Неизвестно';

                            info += `<p><b>${resolutionText}</b> ${settings.width} x ${settings.height}</p>`;
                            info += `<p><b>${aspectRatioText}</b> ${settings.aspectRatio ? settings.aspectRatio.toFixed(2) : unknownText}</p>`;
                            info += `<p><b>${frameRateText}</b> ${settings.frameRate ? Math.round(settings.frameRate) : unknownText} FPS</p>`;
                            info += `<p><b>${imageFormatText}</b> ${settings.width && settings.height ? 'RGB' : unknownText}</p>`;
                        }

                        // Display available capabilities
                        if (capabilities) {
                            // Resolution capabilities
                            if (capabilities.width && capabilities.height) {
                                const availableResText = lang === 'en' ? 'Available resolutions:' : 'Доступные разрешения:';
                                info += `<p><b>${availableResText}</b> `;
                                if (capabilities.width.min && capabilities.width.max &&
                                    capabilities.height.min && capabilities.height.max) {
                                    info += `${capabilities.width.min}x${capabilities.height.min} - ${capabilities.width.max}x${capabilities.height.max}`;
                                } else {
                                    const resolutionsAvailText = lang === 'en' ? 'Various resolutions available' : 'Доступны различные разрешения';
                                    info += resolutionsAvailText;
                                }
                                info += `</p>`;
                            }

                            // Frame rate capabilities
                            if (capabilities.frameRate) {
                                const availableFpsText = lang === 'en' ? 'Available frame rate:' : 'Доступная частота кадров:';
                                const upToText = lang === 'en' ? 'up to' : 'до';
                                const unknownText = lang === 'en' ? 'Unknown' : 'Неизвестно';

                                info += `<p><b>${availableFpsText}</b> `;
                                if (capabilities.frameRate.min && capabilities.frameRate.max) {
                                    info += `${Math.round(capabilities.frameRate.min)}-${Math.round(capabilities.frameRate.max)} FPS`;
                                } else if (capabilities.frameRate.max) {
                                    info += `${upToText} ${Math.round(capabilities.frameRate.max)} FPS`;
                                } else {
                                    info += unknownText;
                                }
                                info += `</p>`;
                            }

                            // Additional capabilities like focus, exposure, etc.
                            if (capabilities.focusMode) {
                                const focusModeText = lang === 'en' ? 'Focus mode:' : 'Режим фокусировки:';
                                const unknownText = lang === 'en' ? 'Unknown' : 'Неизвестно';
                                info += `<p><b>${focusModeText}</b> ${capabilities.focusMode.values ? Array.from(capabilities.focusMode.values).join(', ') : unknownText}</p>`;
                            }

                            if (capabilities.whiteBalanceMode) {
                                const wbModeText = lang === 'en' ? 'White balance mode:' : 'Режим баланса белого:';
                                const notSupportedText = lang === 'en' ? 'Not supported' : 'Не поддерживается';

                                info += `<p><b>${wbModeText}</b> `;
                                if (capabilities.whiteBalanceMode.values) {
                                    const wbValues = Array.from(capabilities.whiteBalanceMode.values);
                                    info += wbValues.length > 0 ? wbValues.join(', ') : notSupportedText;
                                } else {
                                    info += notSupportedText;
                                }
                                info += `</p>`;
                            } else {
                                const wbModeText = lang === 'en' ? 'White balance mode:' : 'Режим баланса белого:';
                                const notSupportedText = lang === 'en' ? 'Not supported' : 'Не поддерживается';
                                info += `<p><b>${wbModeText}</b> ${notSupportedText}</p>`;
                            }

                            if (capabilities.exposureMode) {
                                const exposureModeText = lang === 'en' ? 'Exposure mode:' : 'Режим экспозиции:';
                                const notSupportedText = lang === 'en' ? 'Not supported' : 'Не поддерживается';

                                info += `<p><b>${exposureModeText}</b> `;
                                if (capabilities.exposureMode.values) {
                                    const expValues = Array.from(capabilities.exposureMode.values);
                                    info += expValues.length > 0 ? expValues.join(', ') : notSupportedText;
                                } else {
                                    info += notSupportedText;
                                }
                                info += `</p>`;
                            } else {
                                const exposureModeText = lang === 'en' ? 'Exposure mode:' : 'Режим экспозиции:';
                                const notSupportedText = lang === 'en' ? 'Not supported' : 'Не поддерживается';
                                info += `<p><b>${exposureModeText}</b> ${notSupportedText}</p>`;
                            }

                            if (capabilities.zoom) {
                                const zoomText = lang === 'en' ? 'Zoom:' : 'Масштабирование:';
                                const unknownText = lang === 'en' ? 'Unknown' : 'Неизвестно';
                                info += `<p><b>${zoomText}</b> ${capabilities.zoom.min ? Math.round(capabilities.zoom.min) : unknownText}x - ${capabilities.zoom.max ? Math.round(capabilities.zoom.max) : unknownText}x</p>`;
                            }
                        }

                        // Stop the temporary stream
                        tempStream.getTracks().forEach(track => track.stop());
                    } catch (tempError) {
                        console.warn(`Could not get detailed info for camera ${device.label}:`, tempError);
                        // Fallback to basic information if detailed access fails
                        const deviceTypeText = lang === 'en' ? 'Device type:' : 'Тип устройства:';
                        const frontCameraText = lang === 'en' ? 'Front camera:' : 'Фронтальная камера:';
                        const yesText = lang === 'en' ? 'Yes' : 'Да';
                        const noText = lang === 'en' ? 'No' : 'Нет';

                        info += `<p><b>${deviceTypeText}</b> ${device.kind}</p>`;
                        info += `<p><b>${frontCameraText}</b> ${(device.label.toLowerCase().includes('front') || device.label.toLowerCase().includes('frontcamera')) ? yesText : noText}</p>`;
                    }

                    info += `<br>`;
                }

                webcamInfo.innerHTML = info;
                currentCameraId = videoDevices[0].deviceId;
            } else {
                const noCamerasText = lang === 'en' ? 'No cameras found' : 'Камеры не найдены';
                webcamInfo.textContent = noCamerasText;
            }
        } catch (error) {
            console.error('Error getting camera info:', error);
            const lang = localStorage.getItem('lang') || 'en';
            const errorInfoText = lang === 'en' ? 'Error getting camera information: ' : 'Ошибка получения информации о камере: ';
            webcamInfo.textContent = errorInfoText + error.message;
        }
    }

    function updateStatus() {
        // Update recording status
        const lang = localStorage.getItem('lang') || 'en';
        const recordingText = isMonitoring ?
            (lang === 'en' ? 'Monitoring active' : 'Мониторинг активен') :
            (lang === 'en' ? 'Not recording' : 'Не записывается');
        recordingStatus.textContent = recordingText;
        recordingStatus.style.color = isMonitoring ? 'lightgreen' : 'orange';

        // Update hidden mode status
        const hiddenModeText = isHiddenMode ?
            (lang === 'en' ? 'Enabled' : 'Включен') :
            (lang === 'en' ? 'Disabled' : 'Выключен');
        hiddenMode.textContent = hiddenModeText;
        hiddenMode.style.color = isHiddenMode ? 'lightgreen' : 'orange';
    }

    async function capturePhoto() {
        // Use direct webcam capture via HTML5 Canvas as the primary method (to avoid C++ backend issues)
        const lang = localStorage.getItem('lang') || 'en';
        if (!stream) {
            const alertMsg = lang === 'en' ? 'Camera not activated. Please start monitoring first.' : 'Камера не активирована. Сначала запустите мониторинг.';
            alert(alertMsg);
            return;
        }

        try {
            // Create a canvas element to capture the frame from video
            const canvas = document.createElement('canvas');
            canvas.width = webcamPreview.videoWidth;
            canvas.height = webcamPreview.videoHeight;

            const ctx = canvas.getContext('2d');
            ctx.drawImage(webcamPreview, 0, 0, canvas.width, canvas.height);

            // Convert to data URL (base64 encoded image)
            const dataUrl = canvas.toDataURL('image/jpeg', 0.9);

            // Change background to photo background temporarily
            videoBgIntro.style.display = 'none';
            videoBgMain.style.display = 'none';
            videoBgPhoto.style.display = 'block';

            // Save the photo to the photos directory using Electron's file system (no download prompt)
            if (window.electronAPI) {
                try {
                    // Send the image data to the main process to save
                    const result = await window.electronAPI.savePhoto(dataUrl);
                    console.log('Photo saved via Electron:', result);

                    // After a short delay, revert back to main background
                    setTimeout(() => {
                        videoBgIntro.style.display = 'none';
                        videoBgMain.style.display = 'block';
                        videoBgPhoto.style.display = 'none';
                        const successMsg = lang === 'en' ? 'Photo successfully taken and saved to photos folder!' : 'Фото успешно сделано и сохранено в папку photos!';
                        alert(successMsg);
                    }, 1500); // Show photo background for 1.5 seconds
                } catch (error) {
                    console.error('Error saving photo via Electron:', error);
                    // Revert to main background even if there's an error
                    videoBgIntro.style.display = 'none';
                    videoBgMain.style.display = 'block';
                    videoBgPhoto.style.display = 'none';
                    const errorMsg = lang === 'en' ? 'Error saving photo: ' : 'Ошибка при сохранении фото: ';
                    alert(errorMsg + error.message);
                }
            } else {
                // Fallback to download if not in Electron
                const link = document.createElement('a');
                link.download = `photo_${new Date().toISOString().replace(/[:.]/g, '-')}.jpg`;
                link.href = dataUrl;
                link.click();

                // Revert background after a delay
                setTimeout(() => {
                    videoBgIntro.style.display = 'none';
                    videoBgMain.style.display = 'block';
                    videoBgPhoto.style.display = 'none';
                }, 1500);

                const photoSavedMsg = lang === 'en' ? 'Photo saved!' : 'Фото сохранено!';
                alert(photoSavedMsg);
            }
        } catch (error) {
            console.error('Error capturing photo from webcam:', error);
            // Revert to main background on error
            videoBgIntro.style.display = 'none';
            videoBgMain.style.display = 'block';
            videoBgPhoto.style.display = 'none';
            const captureErrorMsg = lang === 'en' ? 'Error capturing photo from webcam: ' : 'Ошибка при захвате фото с веб-камеры: ';
            alert(captureErrorMsg + error.message);

            // Fallback to C++ backend if JS method fails
            console.log('Attempting fallback to C++ backend...');
            if (window.electronAPI) {
                try {
                    const result = await window.electronAPI.capturePhoto();
                    console.log('Photo captured by C++ backend and saved:', result);
                    const cppSuccessMsg = lang === 'en' ? 'Photo taken and saved to photos folder via C++ backend!' : 'Фото сделано и сохранено в папку photos через C++ backend!';
                    alert(cppSuccessMsg);
                } catch (fallbackError) {
                    console.error('Error capturing photo via C++ backend:', fallbackError);
                    const cppErrorMsg = lang === 'en' ? 'Error capturing photo via C++ backend: ' : 'Ошибка при захвате фото через C++ backend: ';
                    alert(cppErrorMsg + fallbackError.message);
                }
            }
        }
    }

    function toggleHiddenMode() {
        // Check if monitoring is active before enabling hidden mode
        const lang = localStorage.getItem('lang') || 'en';
        const monitoringReqMsg = lang === 'en' ? 'To enable hidden mode, you must first start camera monitoring' : 'Для включения скрытого режима необходимо сначала запустить мониторинг камеры';
        if (!isMonitoring) {
            alert(monitoringReqMsg);
            return;
        }

        // Toggle the hidden mode state
        if (window.electronAPI) {
            window.electronAPI.toggleHiddenMode().then(result => {
                console.log('Toggle hidden mode result:', result);
                // The state will be handled by the start-hidden-mode-capture message
                // Do not update the UI state here since it will be overridden

                // If the result indicates hidden mode was activated, show the warning overlay
                if (result && result.includes('activated')) {
                    setTimeout(() => {
                        if (window.electronAPI) {
                            window.electronAPI.showWarningOverlay();
                        }
                    }, 500); // Slight delay to ensure hidden mode is properly established
                }
            }).catch(error => {
                console.error('Error toggling hidden mode:', error);
                const errorMsg = lang === 'en' ? 'Error toggling hidden mode: ' : 'Ошибка при переключении скрытого режима: ';
                alert(errorMsg + error.message);
            });
        }
    }

    // Hidden mode capture interval
    let hiddenModeCaptureInterval = null;

    // Listen for start hidden mode capture message from main process
    if (window.electronAPI) {
        // Listen for the start hidden mode capture event
        window.electronAPI.onStartHiddenModeCapture(() => {
            console.log('Starting hidden mode capture...');

            // Update hidden mode state
            isHiddenMode = true;
            if (hiddenMode) {
                hiddenMode.textContent = 'Включен';
                hiddenMode.style.color = 'lightgreen';
            }

            // Clear any existing interval to prevent conflicts
            if (hiddenModeCaptureInterval) {
                clearInterval(hiddenModeCaptureInterval);
                hiddenModeCaptureInterval = null;
                console.log('Cleared existing hidden mode capture interval');
            }

            console.log('Hidden mode capture now controlled by main process messages');
        });

        // Confirm that the event listener is being set up
        console.log('Setting up event listener for capture-photo-in-hidden-mode');

        // Listen for the capture-photo-in-hidden-mode event from main process
        window.electronAPI.onCapturePhotoInHiddenMode(async () => {
            console.log('Received capture request from main process for hidden mode');
            console.log('Current stream state:', stream ? 'available' : 'not available');
            console.log('Current video element state:', document.getElementById('webcam-preview') ? 'exists' : 'does not exist');

            // Check if the video element exists and has valid dimensions
            const video = document.getElementById('webcam-preview');
            console.log(`Video element exists: ${!!video}`);
            console.log(`Stream exists: ${!!stream}`);

            if (video && stream) {
                console.log(`Video dimensions - width: ${video.videoWidth}, height: ${video.videoHeight}`);
                console.log(`Video readyState: ${video.readyState}, paused: ${video.paused}, ended: ${video.ended}`);
            } else {
                console.log('Video element or stream does not exist');
                return; // Exit if no video or stream
            }

            try {
                // Try to ensure the video is playing, even when window is hidden
                if (video.paused || video.ended) {
                    console.log('Video is paused or ended, attempting to play...');
                    try {
                        await video.play();
                        console.log('Video play attempted');
                    } catch (playError) {
                        console.warn('Could not play video:', playError);
                        // Continue anyway, as video might still be accessible
                    }
                }

                // Wait a bit to ensure video properties are updated after play attempt
                await new Promise(resolve => setTimeout(resolve, 100));

                // Capture the frame
                const currentVideoWidth = video.videoWidth;
                const currentVideoHeight = video.videoHeight;

                console.log(`Attempting capture with width: ${currentVideoWidth}, height: ${currentVideoHeight}`);

                if (currentVideoWidth > 0 && currentVideoHeight > 0) {
                    console.log('Creating canvas for photo capture...');

                    // Create a canvas to capture the frame from video
                    const canvas = document.createElement('canvas');
                    canvas.width = currentVideoWidth;
                    canvas.height = currentVideoHeight;

                    console.log(`Canvas created with dimensions: ${canvas.width}x${canvas.height}`);

                    const ctx = canvas.getContext('2d');

                    // Draw the video frame to canvas
                    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                    console.log('Frame drawn to canvas');

                    // Convert to data URL
                    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
                    console.log(`Data URL created, length: ${dataUrl.length}`);

                    // Send the image data to the main process for saving
                    if (window.electronAPI) {
                        console.log('Sending photo to main process for saving...');
                        const result = await window.electronAPI.savePhoto(dataUrl);
                        console.log('Hidden mode photo captured and saved via message:', result);

                        // Update UI to show that a photo was taken
                        if (webcamStatus) {
                            const lang = localStorage.getItem('lang') || 'en';
                            const originalStatus = webcamStatus.textContent;
                            const photoTakenText = lang === 'en' ? 'Photo taken!' : 'Фото сделано!';
                            webcamStatus.textContent = photoTakenText;
                            webcamStatus.style.color = 'yellow';

                            // Reset status after a short delay
                            setTimeout(() => {
                                if (webcamStatus) {
                                    webcamStatus.textContent = originalStatus;
                                    webcamStatus.style.color = 'lightgreen';
                                }
                            }, 1500);
                        }
                    } else {
                        console.error('window.electronAPI not available');
                    }
                } else {
                    console.warn('Video dimensions not available for message-triggered capture, width:', currentVideoWidth, 'height:', currentVideoHeight);
                }
            } catch (error) {
                console.error('Error during hidden mode capture:', error);
                console.error('Error stack:', error.stack);
            }
        });

        // Listen for stop hidden mode capture message
        window.electronAPI.onStopHiddenModeCapture(() => {
            if (hiddenModeCaptureInterval) {
                clearInterval(hiddenModeCaptureInterval);
                hiddenModeCaptureInterval = null;
                console.log('Stopped hidden mode capture');
            }

            // Update the UI to reflect hidden mode is no longer active
            isHiddenMode = false;
            if (hiddenMode) {
                hiddenMode.textContent = 'Выключен';
                hiddenMode.style.color = 'orange';
            }
        });

        // Listen for disable hidden mode message from main process (triggered by warning overlay)
        window.electronAPI.onDisableHiddenMode(() => {
            if (hiddenModeCaptureInterval) {
                clearInterval(hiddenModeCaptureInterval);
                hiddenModeCaptureInterval = null;
                console.log('Stopped hidden mode capture via disable button');
            }

            // Update the UI to reflect hidden mode is no longer active
            isHiddenMode = false;
            if (hiddenMode) {
                hiddenMode.textContent = 'Выключен';
                hiddenMode.style.color = 'orange';
            }
        });
    }

    // Handle window unload to properly stop the camera
    window.addEventListener('beforeunload', function() {
        // Clear any intervals when page unloads
        if (hiddenModeCaptureInterval) {
            clearInterval(hiddenModeCaptureInterval);
            hiddenModeCaptureInterval = null;
        }

        if (stream) {
            const tracks = stream.getTracks();
            tracks.forEach(track => track.stop());
        }
    });
});