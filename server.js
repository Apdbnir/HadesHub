const express = require('express');
const { spawn } = require('child_process');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');
const readline = require('readline');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const port = 3000;
let powerMonitorProcess = null;
let lab2Process = null;
let lab3Process = null;

// Serve static files from the project root
app.use(express.static(__dirname));

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

            // For lab3, we'll compile and run the main.cpp file
            function compileWithGpp() {
                return new Promise((resolve) => {
                    const gpp = spawn('g++', ['main.cpp', '-O2', '-std=c++17', '-o', 'diskscan.exe', '-lsetupapi', '-lcfgmgr32'], { cwd: lab3Dir });
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
                    lab3Process = spawn(exePath);
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
                        lab3Process = spawn(path.join(lab3Dir, 'diskscan.exe'));
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

            return res.status(200).json({ message: `Lab ${labId} started successfully.` });
        }
        
        // Support for lab 4 (webcam monitoring)
        else if (labId === '4') {
            const fs = require('fs');
            const lab4Dir = path.join(__dirname, 'lab4');
            const exePath = path.join(lab4Dir, 'webcammonitor.exe');  // Following the pattern
            const srcPath = path.join(lab4Dir, 'main.cpp');

            function compileWithGpp() {
                return new Promise((resolve) => {
                    const gpp = spawn('g++', ['main.cpp', '-O2', '-std=c++17', '-o', 'webcammonitor.exe', '-lole32', '-lwindowscodecs'], { cwd: lab4Dir });
                    gpp.stdout.on('data', d => console.log(`[g++] ${d}`));
                    gpp.stderr.on('data', d => console.error(`[g++] ${d}`));
                    gpp.on('close', (code) => resolve(code === 0));
                    gpp.on('error', () => resolve(false));
                });
            }

            function compileWithCl() {
                return new Promise((resolve) => {
                    const cl = spawn('cl', ['main.cpp', '/Fe:webcammonitor.exe'], { cwd: lab4Dir });
                    cl.stdout.on('data', d => console.log(`[cl] ${d}`));
                    cl.stderr.on('data', d => console.error(`[cl] ${d}`));
                    cl.on('close', (code) => resolve(code === 0));
                    cl.on('error', () => resolve(false));
                });
            }

            // If we already have a lab4 process, kill it first
            if (global.lab4Process) {
                global.lab4Process.kill();
            }

            try {
                if (fs.existsSync(exePath)) {
                    console.log(`Attempting to start existing executable: ${exePath}`);
                    global.lab4Process = spawn(exePath);
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

                    if (built && fs.existsSync(path.join(lab4Dir, 'webcammonitor.exe'))) {
                        console.log('Compilation succeeded; starting webcammonitor.exe');
                        global.lab4Process = spawn(path.join(lab4Dir, 'webcammonitor.exe'));
                    } else {
                        console.log(`Lab 4 source present but failed to compile (checked: ${srcPath})`);
                        return res.status(500).json({ message: `Failed to compile lab ${labId}. Please ensure a valid compiler is installed.` });
                    }
                } else {
                    console.log(`Lab 4 executable/source not found (checked: ${exePath}, ${srcPath})`);
                    return res.status(404).json({ message: `Source or executable for lab ${labId} not found.` });
                }
            }

            const rl4 = readline.createInterface({ input: global.lab4Process.stdout });
            rl4.on('line', (line) => {
                try {
                    const parsed = JSON.parse(line);
                    // Broadcast webcam information to all WebSocket clients with lab identifier
                    broadcast({ type: 'lab4', data: parsed });
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
                return res.status(500).json({ message: 'Failed to start lab4 executable.' });
            });

            return res.status(200).json({ message: `Lab ${labId} started successfully.` });
        }

        res.status(404).json({ message: `Executable for lab ${labId} not found or not configured.` });
    }
});

server.listen(port, () => {
    console.log(`Server listening at http://localhost:${port}`);
});
