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

// Serve static files from the project root
app.use(express.static(__dirname));

// WebSocket connection handler
wss.on('connection', (ws) => {
    console.log('Client connected to WebSocket');

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
        // If no clients are left, kill the child process
        if (wss.clients.size === 0 && powerMonitorProcess) {
            console.log('No clients left, stopping powermonitor.exe');
            powerMonitorProcess.kill();
            powerMonitorProcess = null;
        }
    });
});

function broadcast(data) {
    const jsonData = JSON.stringify(data);
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(jsonData);
        }
    });
}

// Endpoint to start a lab executable
app.post('/start-lab/:labId', (req, res) => {
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
            const executablePath = path.join(__dirname, 'lab2', 'pciscan.exe');
            const fs = require('fs');

            if (!fs.existsSync(executablePath)) {
                console.log(`Lab 2 executable not found at ${executablePath}`);
                return res.status(404).json({ message: `Executable for lab ${labId} not found.` });
            }

            console.log(`Attempting to start: ${executablePath}`);
            const lab2Process = spawn(executablePath);

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

        res.status(404).json({ message: `Executable for lab ${labId} not found or not configured.` });
    }
});

server.listen(port, () => {
    console.log(`Server listening at http://localhost:${port}`);
});
