@echo off
echo Starting HadesHub Lab 4: Webcam Monitor
if exist webcam_monitor_server.exe (
    echo Using existing webcam_monitor_server.exe
    webcam_monitor_server.exe
) else if exist main_server.cpp (
    echo Compiling main_server.cpp...
    g++ main_server.cpp -O2 -std=c++17 -o webcam_monitor_server.exe -lole32 -lwindowscodecs -lsetupapi
    if %ERRORLEVEL% EQU 0 (
        echo Compilation successful. Starting webcam_monitor_server.exe...
        webcam_monitor_server.exe
    ) else (
        echo Compilation failed. Make sure g++ is installed and in PATH.
        pause
    )
) else (
    echo main_server.cpp not found. Cannot compile.
    pause
)