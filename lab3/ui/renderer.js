document.addEventListener('DOMContentLoaded', () => {
    const startBtn = document.getElementById('start-btn');
    const startScreen = document.getElementById('start-screen');
    const mainContent = document.getElementById('main-content');
    const videoBg = document.getElementById('video-bg');
    const videoBgMain = document.getElementById('video-bg-main');
    const diskBody = document.getElementById('disk-body');
    
    // Map to track displayed disks and avoid duplicates
    const disksMap = new Map();

    if (startBtn && startScreen && mainContent && videoBg && videoBgMain) {
        videoBg.play().catch(error => { console.error('Video autoplay failed:', error); });

        startBtn.addEventListener('click', async () => {
            startScreen.style.display = 'none';
            videoBg.style.display = 'none';
            videoBgMain.style.display = 'block';
            videoBgMain.play().catch(error => { console.error('Main video autoplay failed:', error); });
            mainContent.style.display = 'block';

            // Ask server to start lab 3
            try {
                const response = await fetch('/start-lab/3', { method: 'POST' });
                const json = await response.json();
                if (!response.ok) {
                    alert('Failed to start lab 3: ' + json.message);
                    return;
                }
                console.log('Lab3 started:', json.message);
            } catch (e) {
                console.error('Failed to request lab start', e);
            }

            setupWebSocket();
        });
    }

    function makeKey(model, serial) {
        return `${model || ''}-${serial || ''}`;
    }

    function updateRowElements(tr, model, manufacturer, serial, firmware, memoryInfo, interfaceType, supportedModes) {
        // Ensure there are 7 cells; create if structure changed
        while (tr.children.length < 7) tr.appendChild(document.createElement('td'));
        tr.children[0].textContent = model || 'N/A';
        tr.children[1].textContent = manufacturer || 'N/A';
        tr.children[2].textContent = serial || 'N/A';
        tr.children[3].textContent = firmware || 'N/A';
        tr.children[4].textContent = memoryInfo || 'N/A';
        tr.children[5].textContent = interfaceType || 'N/A';
        tr.children[6].textContent = supportedModes || 'N/A';
        
        // keep inline styles consistent
        for (let i = 0; i < 7; i++) {
            tr.children[i].style.padding = '8px';
            tr.children[i].style.borderBottom = '1px solid rgba(255,255,255,0.06)';
        }
    }

    function addRow(model, manufacturer, serial, firmware, memoryInfo, interfaceType, supportedModes) {
        const key = makeKey(model, serial);
        if (disksMap.has(key)) {
            // Update existing row instead of adding duplicate
            const existing = disksMap.get(key);
            updateRowElements(existing, model, manufacturer, serial, firmware, memoryInfo, interfaceType, supportedModes);
            return existing;
        }

        const tr = document.createElement('tr');
        updateRowElements(tr, model, manufacturer, serial, firmware, memoryInfo, interfaceType, supportedModes);
        tr.dataset.diskKey = key;
        disksMap.set(key, tr);
        diskBody.appendChild(tr);
        return tr;
    }

    function setupWebSocket() {
        // Determine the correct WebSocket URL based on the current page protocol
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}`;
        
        const socket = new WebSocket(wsUrl);

        socket.onopen = () => console.log('CLIENT: Disk scan WebSocket connection established.');
        socket.onclose = () => console.log('CLIENT: Disk scan WebSocket connection closed.');
        socket.onerror = (e) => console.error('CLIENT: Disk scan WebSocket error:', e);

        socket.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                
                // Handle lab-specific data
                if (message.type && message.type === 'lab3') {
                    const data = message.data;

                    // Handle structured JSON from backend
                    if (data.model && data.serial) {
                        addRow(
                            data.model, 
                            data.manufacturer, 
                            data.serial, 
                            data.firmware, 
                            data.memoryInfo, 
                            data.interfaceType, 
                            data.supportedModes
                        );
                    } 
                    // Handle full disk array from backend
                    else if (Array.isArray(data.disks)) {
                        disksMap.clear();
                        diskBody.innerHTML = '';
                        
                        if (data.disks.length === 0) {
                            // Show message when no disks are found
                            const tr = document.createElement('tr');
                            tr.innerHTML = '<td colspan="7" style="text-align: center; padding: 20px;">No disk information found. Try running the application as administrator.</td>';
                            diskBody.appendChild(tr);
                        } else {
                            data.disks.forEach(disk => addRow(
                                disk.model, 
                                disk.manufacturer, 
                                disk.serial, 
                                disk.firmware, 
                                disk.memoryInfo, 
                                disk.interfaceType, 
                                disk.supportedModes
                            ));
                        }
                    }
                }
            } catch (e) {
                // Error silently - not logging to keep console clean
            }
        };
    }
});