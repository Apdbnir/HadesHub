@echo off
echo Starting HadesHub Lab 4: Webcam Monitor Backend...
start /min webcam_monitor_server.exe
timeout /t 3 /nobreak >nul
echo Starting HadesHub Lab 4: Webcam Monitor Frontend...
cd ui
npm install
npm start