const express = require('express');
const { spawn } = require('child_process');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');
const readline = require('readline');

const app = express();
// Add middleware to parse JSON in request body
app.use(express.json());

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const port = 3000;
let powerMonitorProcess = null;
let lab2Process = null;
let lab3Process = null;
global.lab4Process = null;
let lab5Process = null;

// Serve static files from the project root
app.use(express.static(__dirname));

// Specific route for favicon.ico to prevent 404 errors
app.get('/favicon.ico', (req, res) => {
    res.status(204); // No content
});

// Specific route for lab4 UI to serve it from /lab4/ui/ path
app.use('/lab4/ui', express.static(path.join(__dirname, 'lab4/ui')));

// Specific route for lab5 UI to serve it from /lab5/ui/ path
app.use('/lab5/ui', express.static(path.join(__dirname, 'lab5/ui')));

// API endpoint to send commands to lab4 process
app.post('/lab4/command', (req, res) => {
    const command = req.body.command;

    if (!global.lab4Process) {
        return res.status(500).json({ error: 'Lab 4 process is not running' });
    }

    if (!command) {
        return res.status(400).json({ error: 'Command is required' });
    }

    try {
        // Send command to the process via stdin
        global.lab4Process.stdin.write(command + '\n');
        res.json({ success: true, command: command });
    } catch (error) {
        console.error('Error sending command to lab4 process:', error);
        res.status(500).json({ error: 'Failed to send command to lab4 process' });
    }
});

// WebSocket connection handler
wss.on('connection', (ws) => {
    console.log('Client connected to WebSocket');

    // If a client connects and lab2 process isn't running, start it automatically
    (async () => {
        try {
            await startLab2();
        } catch (e) {
            console.error('Failed to auto-start Lab2 on WS connection:', e);
        }
    })();

    ws.on('message', (message) => {
        try {
            const command = JSON.parse(message);
            if (command.action && powerMonitorProcess) {
                console.log(`Received command: ${command.action}`);
                // Write command to the stdin of the C++ process
                powerMonitorProcess.stdin.write(`${command.action}\n`);
            }
        } catch (e) {
            console.error('Failed to parse message or send command:', e);
        }
    });

    ws.on('close', () => {
        console.log('Client disconnected');
        // If no clients are left, kill lab processes
        if (wss.clients.size === 0) {
            if (powerMonitorProcess) {
                console.log('No clients left, stopping powermonitor.exe');
                powerMonitorProcess.kill();
                powerMonitorProcess = null;
            }
            if (lab2Process) {
                console.log('No clients left, stopping pciscan.exe');
                lab2Process.kill();
                lab2Process = null;
            }
            if (lab3Process) {
                console.log('No clients left, stopping diskscan.exe');
                lab3Process.kill();
                lab3Process = null;
            }
        }
    });
});

// Helper to compile and start lab2 (id=2). Returns the child process.
async function startLab2() {
    const fs = require('fs');
    const lab2Dir = path.join(__dirname, 'lab2');
    const exePath = path.join(lab2Dir, 'pciscan.exe');
    const srcPath = path.join(lab2Dir, 'main.cpp');

    if (lab2Process) return lab2Process;

    function compileWithGpp() {
        return new Promise((resolve) => {
            // compile both main.cpp and pci_codes.cpp, then link with SetupAPI and CfgMgr
            const gpp = spawn('g++', ['main.cpp', 'pci_codes.cpp', '-O2', '-std=c++17', '-o', 'pciscan.exe', '-lsetupapi', '-lcfgmgr32'], { cwd: lab2Dir });
            gpp.stdout.on('data', d => console.log(`[g++] ${d}`));
            gpp.stderr.on('data', d => console.error(`[g++] ${d}`));
            gpp.on('close', (code) => resolve(code === 0));
            gpp.on('error', () => resolve(false));
        });
    }

    function compileWithCl() {
        return new Promise((resolve) => {
            const cl = spawn('cl', ['main.cpp', '/Fe:pciscan.exe'], { cwd: lab2Dir });
            cl.stdout.on('data', d => console.log(`[cl] ${d}`));
            cl.stderr.on('data', d => console.error(`[cl] ${d}`));
            cl.on('close', (code) => resolve(code === 0));
            cl.on('error', () => resolve(false));
        });
    }

    if (fs.existsSync(exePath)) {
        console.log(`Attempting to start existing executable: ${exePath}`);
        lab2Process = spawn(exePath);
    } else if (fs.existsSync(srcPath)) {
        console.log('Source found for Lab2; attempting to compile main.cpp');
        let built = await compileWithGpp();
        if (!built) {
            console.log('g++ compile failed or not found, trying cl (MSVC)');
            built = await compileWithCl();
        }

        if (built && fs.existsSync(exePath)) {
            console.log('Compilation succeeded; starting pciscan.exe');
            lab2Process = spawn(exePath);
        } else {
            throw new Error('Failed to compile lab2 source.');
        }
    } else {
        throw new Error('Lab2 source/executable not found.');
    }

    // Pipe stdout lines to broadcast
    const rl2 = readline.createInterface({ input: lab2Process.stdout });
    rl2.on('line', (line) => {
        try {
            const parsed = JSON.parse(line);
            broadcast(parsed);
        } catch (e) {
            broadcast({ line: line });
        }
    });

    lab2Process.stderr.on('data', (data) => {
        console.error(`Lab2 stderr: ${data}`);
    });

    lab2Process.on('close', (code) => {
        console.log(`Lab2 process exited with code ${code}`);
        broadcast({ event: 'process_exited', code: code });
        lab2Process = null;
    });

    lab2Process.on('error', (err) => {
        console.error('Failed to start lab2 subprocess.', err);
        lab2Process = null;
    });

    return lab2Process;
}

function broadcast(data) {
    const jsonData = JSON.stringify(data);
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(jsonData);
        }
    });
}

// Endpoint to start a lab executable
app.post('/start-lab/:labId', async (req, res) => {
    const labId = req.params.labId;

    if (labId === '1') {
        if (powerMonitorProcess) {
            console.log('Power monitor is already running.');
            return res.status(200).json({ message: 'Lab 1 process already running.' });
        }

        const executablePath = path.join(__dirname, 'lab1', 'powermonitor.exe');
        console.log(`Attempting to start: ${executablePath}`);

        powerMonitorProcess = spawn(executablePath);

        const rl = readline.createInterface({ input: powerMonitorProcess.stdout });

        rl.on('line', (line) => {
            try {
                // Каждая строка теперь является полноценным JSON-объектом
                const powerData = JSON.parse(line);
                broadcast(powerData);
            } catch (e) {
                console.error('Error parsing JSON from powermonitor:', e, 'Line:', line);
            }
        });

        powerMonitorProcess.stderr.on('data', (data) => {
            console.error(`PowerMonitor stderr: ${data}`);
        });

        powerMonitorProcess.on('close', (code) => {
            console.log(`Power monitor process exited with code ${code}`);
            powerMonitorProcess = null;
            broadcast({ event: 'process_exited', code: code });
        });

        powerMonitorProcess.on('error', (err) => {
            console.error('Failed to start subprocess.', err);
            res.status(500).json({ message: 'Failed to start executable.' });
            powerMonitorProcess = null;
        });

        res.status(200).json({ message: `Lab ${labId} started successfully.` });

    } else {
        // Support starting lab 2 if an executable is provided in lab2 folder (pciscan.exe)
        if (labId === '2') {
            const fs = require('fs');
            const lab2Dir = path.join(__dirname, 'lab2');
            const exePath = path.join(lab2Dir, 'pciscan.exe');
            const srcPath = path.join(lab2Dir, 'main.cpp');
            const jsFallback = path.join(lab2Dir, 'pciscan.js');

            // Helper: try compile with g++, then cl as fallback
            function compileWithGpp() {
                return new Promise((resolve) => {
                    const gpp = spawn('g++', ['main.cpp', 'pci_codes.cpp', '-O2', '-std=c++17', '-o', 'pciscan.exe', '-lsetupapi', '-lcfgmgr32'], { cwd: lab2Dir });
                    gpp.stdout.on('data', d => console.log(`[g++] ${d}`));
                    gpp.stderr.on('data', d => console.error(`[g++] ${d}`));
                    gpp.on('close', (code) => resolve(code === 0));
                    gpp.on('error', () => resolve(false));
                });
            }

            function compileWithCl() {
                return new Promise((resolve) => {
                    // cl requires Visual Studio environment; try a simple call
                    const cl = spawn('cl', ['main.cpp', '/Fe:pciscan.exe'], { cwd: lab2Dir });
                    cl.stdout.on('data', d => console.log(`[cl] ${d}`));
                    cl.stderr.on('data', d => console.error(`[cl] ${d}`));
                    cl.on('close', (code) => resolve(code === 0));
                    cl.on('error', () => resolve(false));
                });
            }

            let lab2Process;

            // If exe already exists, prefer it
            if (fs.existsSync(exePath)) {
                console.log(`Attempting to start existing executable: ${exePath}`);
                lab2Process = spawn(exePath);
            } else if (fs.existsSync(srcPath)) {
                // Try to compile
                console.log('Source found for Lab2; attempting to compile main.cpp');
                let built = await compileWithGpp();
                if (!built) {
                    console.log('g++ compile failed or not found, trying cl (MSVC)');
                    built = await compileWithCl();
                }

                if (built && fs.existsSync(exePath)) {
                    console.log('Compilation succeeded; starting pciscan.exe');
                    lab2Process = spawn(exePath);
                } else {
                    console.log(`Lab 2 source present but failed to compile or no exe produced (checked: ${srcPath})`);
                    return res.status(500).json({ message: `Failed to compile lab ${labId}. Please ensure a valid compiler is installed.` });
                }
            } else {
                console.log(`Lab 2 executable/source not found (checked: ${exePath}, ${srcPath})`);
                return res.status(404).json({ message: `Source or executable for lab ${labId} not found.` });
            }

            const rl2 = readline.createInterface({ input: lab2Process.stdout });
            rl2.on('line', (line) => {
                // Try to parse JSON lines; otherwise broadcast raw line
                try {
                    const parsed = JSON.parse(line);
                    broadcast(parsed);
                } catch (e) {
                    broadcast({ line: line });
                }
            });

            lab2Process.stderr.on('data', (data) => {
                console.error(`Lab2 stderr: ${data}`);
            });

            lab2Process.on('close', (code) => {
                console.log(`Lab2 process exited with code ${code}`);
                broadcast({ event: 'process_exited', code: code });
            });

            lab2Process.on('error', (err) => {
                console.error('Failed to start lab2 subprocess.', err);
                return res.status(500).json({ message: 'Failed to start lab2 executable.' });
            });

            return res.status(200).json({ message: `Lab ${labId} started successfully.` });
        }

        // Support for lab 3 (disk information)
        else if (labId === '3') {
            const fs = require('fs');
            const lab3Dir = path.join(__dirname, 'lab3');
            const exePath = path.join(lab3Dir, 'diskscan.exe');  // Following the pattern from lab2 (pciscan.exe)
            const srcPath = path.join(lab3Dir, 'main.cpp');

            // Get the disk type from query parameter (hdd or ssd)
            const diskType = req.query.type ? req.query.type.toLowerCase() : 'both';
            console.log(`Starting lab3 with disk type: ${diskType}`);

            // For lab3, we'll compile and run the main.cpp file
            function compileWithGpp() {
                return new Promise((resolve) => {
                    const gpp = spawn('g++', ['main.cpp', '-O2', '-std=c++98', '-m32', '-o', 'diskscan.exe', '-lsetupapi', '-lcfgmgr32'], { cwd: lab3Dir });
                    gpp.stdout.on('data', d => console.log(`[g++] ${d}`));
                    gpp.stderr.on('data', d => console.error(`[g++] ${d}`));
                    gpp.on('close', (code) => resolve(code === 0));
                    gpp.on('error', () => resolve(false));
                });
            }

            function compileWithCl() {
                return new Promise((resolve) => {
                    const cl = spawn('cl', ['main.cpp', '/Fe:diskscan.exe'], { cwd: lab3Dir });
                    cl.stdout.on('data', d => console.log(`[cl] ${d}`));
                    cl.stderr.on('data', d => console.error(`[cl] ${d}`));
                    cl.on('close', (code) => resolve(code === 0));
                    cl.on('error', () => resolve(false));
                });
            }

            try {
                if (fs.existsSync(exePath)) {
                    console.log(`Attempting to start existing executable: ${exePath}`);
                    // Pass the disk type as a command line argument
                    lab3Process = spawn(exePath, [diskType.toUpperCase()], { cwd: lab3Dir });
                } else {
                    throw new Error('Executable does not exist'); // Force compilation if executable doesn't exist
                }
            } catch (spawnError) {
                // If spawning executable failed or executable doesn't exist, try to compile
                if (fs.existsSync(srcPath)) {
                    console.log('Source found for Lab3; attempting to compile main.cpp');
                    let built = await compileWithGpp();
                    if (!built) {
                        console.log('g++ compile failed or not found, trying cl (MSVC)');
                        built = await compileWithCl();
                    }

                    if (built && fs.existsSync(path.join(lab3Dir, 'diskscan.exe'))) {
                        console.log('Compilation succeeded; starting diskscan.exe');
                        // Pass the disk type as a command line argument
                        lab3Process = spawn(path.join(lab3Dir, 'diskscan.exe'), [diskType.toUpperCase()], { cwd: lab3Dir });
                    } else {
                        console.log(`Lab 3 source present but failed to compile (checked: ${srcPath})`);
                        return res.status(500).json({ message: `Failed to compile lab ${labId}. Please ensure a valid compiler is installed.` });
                    }
                } else {
                    console.log(`Lab 3 executable/source not found (checked: ${exePath}, ${srcPath})`);
                    return res.status(404).json({ message: `Source or executable for lab ${labId} not found.` });
                }
            }

            const rl3 = readline.createInterface({ input: lab3Process.stdout });
            rl3.on('line', (line) => {
                try {
                    const parsed = JSON.parse(line);
                    // Broadcast disk information to all WebSocket clients with lab identifier
                    broadcast({ type: 'lab3', data: parsed });
                } catch (e) {
                    // Error silently - not logging to keep console clean
                }
            });

            lab3Process.stderr.on('data', (data) => {
                console.error(`Lab3 stderr: ${data}`);
            });

            lab3Process.on('close', (code) => {
                console.log(`Lab3 process exited with code ${code}`);
                broadcast({ event: 'process_exited', code: code });
            });

            lab3Process.on('error', (err) => {
                console.error('Failed to start lab3 subprocess.', err);
                return res.status(500).json({ message: 'Failed to start lab3 executable.' });
            });

            return res.status(200).json({ message: `Lab ${labId} (type: ${diskType}) started successfully.` });
        }

        // Support for lab 4 (webcam monitoring)
        else if (labId === '4') {
            const fs = require('fs');
            const lab4Dir = path.join(__dirname, 'lab4');
            const exePath = path.join(lab4Dir, 'webcam_monitor.exe');  // Using the compiled name
            const srcPath = path.join(lab4Dir, 'main.cpp');  // Use the main.cpp file

            // If we already have a lab4 process, kill it first
            if (global.lab4Process) {
                global.lab4Process.kill();
            }

            function compileWithGpp() {
                return new Promise((resolve) => {
                    // For Lab 4, use CMake which is more reliable for OpenCV
                    const cmakeConfigure = spawn('cmake', [
                        '.',
                        '-G', 'MinGW Makefiles',
                        `-DOpenCV_DIR=C:\\VS Code\\HadesHub\\lab4\\opencv-4.12.0\\build`
                    ], { cwd: lab4Dir });

                    let output = '';
                    let errorOutput = '';

                    cmakeConfigure.stdout.on('data', d => {
                        output += d.toString();
                        console.log(`[cmake configure] lab4: ${d}`);
                    });
                    cmakeConfigure.stderr.on('data', d => {
                        errorOutput += d.toString();
                        console.error(`[cmake configure] lab4: ${d}`);
                    });
                    cmakeConfigure.on('close', (code) => {
                        if (code === 0) {
                            // Now build with cmake
                            console.log('CMake configure successful, starting build...');
                            const cmakeBuild = spawn('cmake', ['--build', '.', '--config', 'Release'], { cwd: lab4Dir });

                            cmakeBuild.stdout.on('data', d => {
                                output += d.toString();
                                console.log(`[cmake build] lab4: ${d}`);
                            });
                            cmakeBuild.stderr.on('data', d => {
                                errorOutput += d.toString();
                                console.error(`[cmake build] lab4: ${d}`);
                            });
                            cmakeBuild.on('close', (buildCode) => {
                                if (buildCode === 0) {
                                    console.log('Lab4 compiled successfully with CMake');
                                    resolve(true);
                                } else {
                                    console.log('Lab4 build failed with CMake');
                                    console.error('Build errors:', errorOutput);
                                    resolve(false);
                                }
                            });
                        } else {
                            console.log('CMake configure failed for Lab4');
                            console.error('Configure errors:', errorOutput);
                            resolve(false);
                        }
                    });
                });
            }

            function compileWithCl() {
                return new Promise((resolve) => {
                    // For MSVC compilation with OpenCV (fallback approach)
                    const cl = spawn('cl', [
                        'main.cpp',
                        '/EHsc',
                        '/std:c++17',
                        '/I"C:\\VS Code\\HadesHub\\lab4\\opencv-4.12.0\\include"',
                        '/Fe:webcam_monitor.exe',
                        '/link',
                        '/LIBPATH:"C:\\VS Code\\HadesHub\\lab4\\opencv-4.12.0\\build\\lib"',
                        'opencv_core4120.lib',
                        'opencv_videoio4120.lib',
                        'opencv_imgproc4120.lib',
                        'opencv_imgcodecs4120.lib',
                        'opencv_highgui4120.lib',
                        'opencv_objdetect4120.lib',
                        'opencv_calib3d4120.lib',
                        'opencv_features2d4120.lib',
                        'opencv_photo4120.lib',
                        'opencv_dnn4120.lib',
                        'opencv_gapi4120.lib',
                        'setupapi.lib',
                        'ole32.lib',
                        'oleaut32.lib'
                    ], { cwd: lab4Dir });

                    let output = '';
                    let errorOutput = '';

                    cl.stdout.on('data', d => {
                        output += d.toString();
                        console.log(`[cl] lab4: ${d}`);
                    });
                    cl.stderr.on('data', d => {
                        errorOutput += d.toString();
                        console.error(`[cl] lab4: ${d}`);
                    });
                    cl.on('close', (code) => {
                        if (code === 0) {
                            console.log('Lab4 compiled successfully with MSVC');
                            resolve(true);
                        } else {
                            console.log('Lab4 compilation failed with MSVC');
                            console.error('Compilation errors:', errorOutput);
                            resolve(false);
                        }
                    });
                    cl.on('error', (err) => {
                        console.error(`[cl] lab4 compilation error: ${err.message}`);
                        resolve(false);
                    });
                });
            }

            try {
                if (fs.existsSync(exePath)) {
                    console.log(`Attempting to start existing executable: ${exePath}`);
                    global.lab4Process = spawn(exePath, [], { cwd: lab4Dir });
                } else {
                    throw new Error('Executable does not exist'); // Force compilation if executable doesn't exist
                }
            } catch (spawnError) {
                // If spawning executable failed or executable doesn't exist, try to compile
                if (fs.existsSync(srcPath)) {
                    console.log('Source found for Lab4; attempting to compile main.cpp');
                    let built = await compileWithGpp();
                    if (!built) {
                        console.log('g++ compile failed or not found, trying cl (MSVC)');
                        built = await compileWithCl();
                    }

                    if (built && fs.existsSync(path.join(lab4Dir, 'webcam_monitor.exe'))) {
                        console.log('Compilation succeeded; starting webcam_monitor.exe');
                        global.lab4Process = spawn(path.join(lab4Dir, 'webcam_monitor.exe'), [], { cwd: lab4Dir });
                    } else {
                        console.log(`Lab 4 source present but failed to compile (checked: ${srcPath})`);
                        return res.status(500).json({ message: `Failed to compile lab ${labId}. Please ensure a valid compiler is installed.` });
                    }
                } else {
                    console.log(`Lab 4 executable/source not found (checked: ${exePath}, ${srcPath})`);
                    return res.status(404).json({ message: `Source or executable for lab ${labId} not found.` });
                }
            }

            // Initialize status file with default values
            const statusPath = path.join(lab4Dir, 'webcam_status.json');
            fs.writeFileSync(statusPath, JSON.stringify({
                webcam_active: false,
                recording: false,
                hidden_mode: false,
                camera_info: {
                    index: 0,
                    name: "Not initialized",
                    width: 0,
                    height: 0,
                    fps: 0,
                    sensor_type: "Unknown",
                    matrix_type: "Unknown",
                    min_illumination: 0,
                    focus_type: "Unknown",
                    video_hdr: "Not supported",
                    brightness: 0,
                    contrast: 0,
                    sharpness: 0,
                    saturation: 0,
                    is_opened: false,
                    simulated: true
                }
            }, null, 2));

            const rl4 = readline.createInterface({ input: global.lab4Process.stdout });
            rl4.on('line', (line) => {
                try {
                    const parsed = JSON.parse(line);
                    // Broadcast webcam information to all WebSocket clients with lab identifier
                    broadcast({ type: 'lab4', data: parsed });

                    // Update status file with current status (not just the received data)
                    try {
                        // Read current status and update it with the received data
                        let currentStatus;
                        try {
                            currentStatus = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
                        } catch (e) {
                            currentStatus = {
                                webcam_active: false,
                                recording: false,
                                hidden_mode: false,
                                camera_info: {
                                    index: 0,
                                    name: "Not initialized",
                                    width: 0,
                                    height: 0,
                                    fps: 0,
                                    sensor_type: "Unknown",
                                    matrix_type: "Unknown",
                                    min_illumination: 0,
                                    focus_type: "Unknown",
                                    video_hdr: "Not supported",
                                    brightness: 0,
                                    contrast: 0,
                                    sharpness: 0,
                                    saturation: 0,
                                    is_opened: false,
                                    simulated: true
                                }
                            };
                        }

                        // Update status based on received data
                        if (parsed.action === 'photo_taken') {
                            currentStatus.webcam_active = true;
                        } else if (parsed.action === 'recording_started') {
                            currentStatus.recording = true;
                        } else if (parsed.action === 'recording_stopped') {
                            currentStatus.recording = false;
                        } else if (parsed.action === 'console_hidden') {
                            currentStatus.hidden_mode = true;
                        } else if (parsed.action === 'console_shown') {
                            currentStatus.hidden_mode = false;
                        } else if (parsed.status === 'ready') {
                            currentStatus.webcam_active = true;
                        } else if (parsed.status === 'active' && parsed.camera_info) {
                            // Update with full camera info
                            currentStatus.webcam_active = true;
                            currentStatus.camera_info = parsed.camera_info;
                        }

                        fs.writeFileSync(statusPath, JSON.stringify(currentStatus, null, 2));
                    } catch (e) {
                        console.error('Error updating webcam_status.json:', e);
                    }
                } catch (e) {
                    // Error silently - not logging to keep console clean
                }
            });

            global.lab4Process.stderr.on('data', (data) => {
                console.error(`Lab4 stderr: ${data}`);
            });

            global.lab4Process.on('close', (code) => {
                console.log(`Lab4 process exited with code ${code}`);
                broadcast({ event: 'process_exited', code: code });
            });

            global.lab4Process.on('error', (err) => {
                console.error('Failed to start lab4 subprocess.', err);
            });

            return res.status(200).json({ message: `Lab ${labId} started successfully.` });
        }

        // Support for lab 5 (USB device monitoring)
        else if (labId === '5') {
            const fs = require('fs');
            const lab5Dir = path.join(__dirname, 'lab5');
            const exePath = path.join(lab5Dir, 'usbmonitor.exe');  // Following the pattern from other labs
            const srcPath = path.join(lab5Dir, 'main.cpp');

            // If we already have a lab5 process, kill it first
            if (lab5Process) {
                lab5Process.kill();
            }

            function compileWithGpp() {
                return new Promise((resolve) => {
                    const gpp = spawn('g++', ['main.cpp', '-O2', '-std=c++17', '-o', 'usbmonitor.exe', '-lsetupapi', '-lole32', '-loleaut32', '-lwbemuuid', '-ladvapi32'], { cwd: lab5Dir });
                    gpp.stdout.on('data', d => console.log(`[g++] lab5: ${d}`));
                    gpp.stderr.on('data', d => console.error(`[g++] lab5: ${d}`));
                    gpp.on('close', (code) => resolve(code === 0));
                    gpp.on('error', (err) => {
                        console.error(`[g++] lab5 compilation error: ${err}`);
                        resolve(false);
                    });
                });
            }

            function compileWithCl() {
                return new Promise((resolve) => {
                    // MSVC compilation
                    const cl = spawn('cl', ['main.cpp', '/EHsc', '/Fe:usbmonitor.exe', '/link', 'setupapi.lib', 'ole32.lib', 'oleaut32.lib', 'uuid.lib'], { cwd: lab5Dir });
                    cl.stdout.on('data', d => console.log(`[cl] lab5: ${d}`));
                    cl.stderr.on('data', d => console.error(`[cl] lab5: ${d}`));
                    cl.on('close', (code) => resolve(code === 0));
                    cl.on('error', (err) => {
                        console.error(`[cl] lab5 compilation error: ${err}`);
                        resolve(false);
                    });
                });
            }

            try {
                if (fs.existsSync(exePath)) {
                    console.log(`Attempting to start existing executable: ${exePath}`);
                    lab5Process = spawn(exePath, [], { cwd: lab5Dir });
                } else {
                    throw new Error('Executable does not exist'); // Force compilation if executable doesn't exist
                }
            } catch (spawnError) {
                // If spawning executable failed or executable doesn't exist, try to compile
                if (fs.existsSync(srcPath)) {
                    console.log('Source found for Lab5; attempting to compile main.cpp');
                    let built = await compileWithGpp();
                    if (!built) {
                        console.log('g++ compile failed or not found, trying cl (MSVC)');
                        built = await compileWithCl();
                    }

                    if (built && fs.existsSync(path.join(lab5Dir, 'usbmonitor.exe'))) {
                        console.log('Compilation succeeded; starting usbmonitor.exe');
                        lab5Process = spawn(path.join(lab5Dir, 'usbmonitor.exe'), [], { cwd: lab5Dir });
                    } else {
                        console.log(`Lab 5 source present but failed to compile (checked: ${srcPath})`);
                        return res.status(500).json({ message: `Failed to compile lab ${labId}. Please ensure a valid compiler is installed.` });
                    }
                } else {
                    console.log(`Lab 5 executable/source not found (checked: ${exePath}, ${srcPath})`);
                    return res.status(404).json({ message: `Source or executable for lab ${labId} not found.` });
                }
            }

            const rl5 = readline.createInterface({ input: lab5Process.stdout });
            rl5.on('line', (line) => {
                try {
                    const parsed = JSON.parse(line);
                    // Broadcast USB device information to all WebSocket clients with lab identifier
                    broadcast({ type: 'lab5', data: parsed });

                    // Handle different types of messages from the USB monitor
                    if (parsed.event === 'device_connected') {
                        console.log(`USB Device Connected: ${parsed.device_name}`);
                    } else if (parsed.event === 'device_disconnected') {
                        console.log(`USB Device Disconnected: ${parsed.device_name}`);
                    } else if (parsed.event === 'device_list') {
                        console.log(`USB Device List: ${parsed.device_count} devices`);
                    }
                } catch (e) {
                    // Error silently - not logging to keep console clean
                }
            });

            lab5Process.stderr.on('data', (data) => {
                console.error(`Lab5 stderr: ${data}`);
            });

            lab5Process.on('close', (code) => {
                console.log(`Lab5 process exited with code ${code}`);
                broadcast({ event: 'process_exited', code: code });
            });

            lab5Process.on('error', (err) => {
                console.error('Failed to start lab5 subprocess.', err);
            });

            return res.status(200).json({ message: `Lab ${labId} started successfully.` });
        }

        res.status(404).json({ message: `Executable for lab ${labId} not found or not configured.` });
    }
});

server.listen(port, () => {
    console.log(`Server listening at http://localhost:${port}`);
});
