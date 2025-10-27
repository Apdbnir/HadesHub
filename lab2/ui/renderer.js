document.addEventListener('DOMContentLoaded', () => {
    const startBtn = document.getElementById('start-btn');
    const startScreen = document.getElementById('start-screen');
    const mainContent = document.getElementById('main-content');
    const videoBg = document.getElementById('video-bg');
    const videoBgMain = document.getElementById('video-bg-main');
    const pciBody = document.getElementById('pci-body');
    // Map to track displayed devices and avoid duplicates. Keyed by slot when available,
    // otherwise by vid:did:vendorName
    const devicesMap = new Map();

    if (startBtn && startScreen && mainContent && videoBg && videoBgMain) {
        videoBg.play().catch(error => { console.error('Video autoplay failed:', error); });

        startBtn.addEventListener('click', async () => {
            startScreen.style.display = 'none';
            videoBg.style.display = 'none';
            videoBgMain.style.display = 'block';
            videoBgMain.play().catch(error => { console.error('Main video autoplay failed:', error); });
            mainContent.style.display = 'flex';

            // Ask server to start lab 2
            try {
                const response = await fetch('/start-lab/2', { method: 'POST' });
                const json = await response.json();
                if (!response.ok) {
                    alert('Failed to start lab 2: ' + json.message);
                    return;
                }
                console.log('Lab2 started:', json.message);
            } catch (e) {
                console.error('Failed to request lab start', e);
            }

            setupWebSocket();
        });
    }

    function makeKey(slot, vid, did, deviceName) {
        // Ensure we have clean string values to work with
        const cleanSlot = (slot && typeof slot === 'string') ? slot : '';
        const cleanVid = (vid && typeof vid === 'string') ? vid : '';
        const cleanDid = (did && typeof did === 'string') ? did : '';
        
        // If slot is a valid identifier, use it
        if (cleanSlot && cleanSlot !== '-' && cleanSlot !== '') {
            // Make sure slot doesn't contain JSON or other complex data
            return cleanSlot.split(' ')[0]; // Just take the first part if there are spaces
        }
        
        // Otherwise use vid:did combination
        return `${cleanVid}:${cleanDid}`;
    }

    function updateRowElements(tr, slot, vid, did, deviceName) {
        // Completely clear and rebuild the row to ensure proper column mapping
        tr.innerHTML = '';
        
        // Explicitly create each cell and ensure it gets the correct data
        const cell1 = document.createElement('td');
        cell1.textContent = slot || '';
        cell1.style.padding = '8px';
        cell1.style.borderBottom = '1px solid rgba(255,255,255,0.06)';
        cell1.style.textAlign = 'left';
        cell1.setAttribute('data-column', 'slot'); // For debugging
        tr.appendChild(cell1);
        
        const cell2 = document.createElement('td');
        cell2.textContent = vid || '';
        cell2.style.padding = '8px';
        cell2.style.borderBottom = '1px solid rgba(255,255,255,0.06)';
        cell2.style.textAlign = 'left';
        cell2.setAttribute('data-column', 'vid'); // For debugging
        tr.appendChild(cell2);
        
        const cell3 = document.createElement('td');
        cell3.textContent = did || '';
        cell3.style.padding = '8px';
        cell3.style.borderBottom = '1px solid rgba(255,255,255,0.06)';
        cell3.style.textAlign = 'left';
        cell3.setAttribute('data-column', 'did'); // For debugging
        tr.appendChild(cell3);
        
        const cell4 = document.createElement('td');
        cell4.textContent = deviceName || '';
        cell4.style.padding = '8px';
        cell4.style.borderBottom = '1px solid rgba(255,255,255,0.06)';
        cell4.style.textAlign = 'left';
        cell4.setAttribute('data-column', 'deviceName'); // For debugging
        tr.appendChild(cell4);
    }

    function addRow(slot, vid, did, deviceName) {
        const key = makeKey(slot, vid, did, deviceName);
        if (devicesMap.has(key)) {
            // Update existing row instead of adding duplicate
            const existing = devicesMap.get(key);
            updateRowElements(existing, slot || '', vid || '', did || '', deviceName || '');
            return existing;
        }

        const tr = document.createElement('tr');
        updateRowElements(tr, slot || '', vid || '', did || '', deviceName || '');
        tr.dataset.deviceKey = key;
        devicesMap.set(key, tr);
        pciBody.appendChild(tr);
        return tr;
    }

    function parseLine(line) {
        // Expect either JSON {slot, vid, did, vendor} or raw lines like "[0000:00:1f.0] VEN_8086 DEV_9d71 ..."
        try {
            const obj = JSON.parse(line);
            // Check if this is a single device object with the required fields
            if (obj.hasOwnProperty('slot') && obj.hasOwnProperty('vid') && obj.hasOwnProperty('did')) {
                const deviceName = obj.deviceName || obj.vendor || '';
                console.log("parseLine handled single device:", obj.slot, obj.vid, obj.did, deviceName);
                addRow(obj.slot, obj.vid, obj.did, deviceName);
                return;
            }
            // If it's a device array JSON object: {"devices": [...]}
            else if (obj.devices && Array.isArray(obj.devices)) {
                console.log("parseLine handled device array with", obj.devices.length, "devices");
                // Don't clear existing devices here since this might be incremental
                obj.devices.forEach((dev) => {
                    const deviceName = dev.deviceName || dev.vendor || '';
                    addRow(dev.slot, dev.vid, dev.did, deviceName);
                });
                return;
            }
        } catch (e) {
            // not JSON, continue to fallback parsing
        }

        // Fallback parsing for raw text data
        const venMatch = line.match(/VEN_([0-9A-Fa-f]{4})/);
        const devMatch = line.match(/DEV_([0-9A-Fa-f]{4})/);
        const slotMatch = line.match(/\[([^\]]+)\]/);
        const vendorNameMatch = line.match(/\] ?(.+)/);

        const vid = venMatch ? venMatch[1] : '----';
        const did = devMatch ? devMatch[1] : '----';
        const slot = slotMatch ? slotMatch[1] : '-';
        let vendorName = '';
        if (vendorNameMatch) {
            vendorName = vendorNameMatch[1].trim();
            // remove VEN_/DEV_ parts
            vendorName = vendorName.replace(/VEN_[0-9A-Fa-f]{4}/, '');
            vendorName = vendorName.replace(/DEV_[0-9A-Fa-f]{4}/, '');
            vendorName = vendorName.replace(/[^\w\s\-\[\]]+/g, ' ').trim();
        }

        addRow(slot, vid, did, vendorName);
    }

    function setupWebSocket() {
        const socket = new WebSocket('ws://localhost:3000');

        socket.onopen = () => {
            console.log('WebSocket connection opened');
        };
        socket.onclose = () => {
            console.log('WebSocket connection closed');
        };
        socket.onerror = (error) => {
            console.error('WebSocket error:', error);
        };

        socket.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                
                // Handle device data that comes in {"line": "JSON string"} format
                if (data.line) {
                    try {
                        // Attempt to parse as-is first
                        const lineData = JSON.parse(data.line);
                        
                        // Process device array: {"devices": [...]}
                        if (lineData.devices && Array.isArray(lineData.devices)) {
                            // Clear existing data and populate with new device list
                            devicesMap.clear();
                            pciBody.innerHTML = '';
                            
                            lineData.devices.forEach((dev) => {
                                // Explicitly extract each field to ensure correct assignment
                                const slot = dev.slot || '';
                                const vid = dev.vid || '';
                                const did = dev.did || '';
                                const deviceName = dev.deviceName || dev.vendor || '';
                                
                                // Each parameter goes to the correct column position:
                                // 1st param (slot) → 1st column
                                // 2nd param (vid) → 2nd column  
                                // 3rd param (did) → 3rd column
                                // 4th param (deviceName) → 4th column
                                addRow(slot, vid, did, deviceName);
                            });
                        } 
                        // Process single device object directly in the line
                        else if (lineData.slot !== undefined && lineData.vid !== undefined && lineData.did !== undefined) {
                            const slot = lineData.slot || '';
                            const vid = lineData.vid || '';
                            const did = lineData.did || '';
                            const deviceName = lineData.deviceName || lineData.vendor || '';
                            
                            addRow(slot, vid, did, deviceName);
                        }
                    } catch (parseError) {
                        // If there's a JSON parsing error, try to clean and fix the data
                        try {
                            // Remove null bytes and other control characters that break JSON
                            const cleanedLine = data.line.replace(/[\u0000-\u001F\u007F-\u009F]/g, '');
                            const cleanedData = JSON.parse(cleanedLine);
                            
                            // Process device array with cleaned data
                            if (cleanedData.devices && Array.isArray(cleanedData.devices)) {
                                // Clear existing data and populate with new device list
                                devicesMap.clear();
                                pciBody.innerHTML = '';
                                
                                cleanedData.devices.forEach((dev) => {
                                    // Explicitly extract each field to ensure correct assignment
                                    const slot = dev.slot || '';
                                    const vid = dev.vid || '';
                                    const did = dev.did || '';
                                    // Clean the device name too to remove control chars
                                    let deviceName = dev.deviceName || dev.vendor || '';
                                    deviceName = deviceName.replace(/[\u0000-\u001F\u007F-\u009F]/g, '');
                                    
                                    addRow(slot, vid, did, deviceName);
                                });
                            }
                        } catch (cleanError) {
                            console.error("Error parsing cleaned line data as JSON:", cleanError);
                        }
                    }
                }
                // Handle device data that comes directly in the message (not nested)
                else if (data.devices && Array.isArray(data.devices)) {
                    devicesMap.clear();
                    pciBody.innerHTML = '';
                    
                    data.devices.forEach((dev) => {
                        const slot = dev.slot || '';
                        const vid = dev.vid || '';
                        const did = dev.did || '';
                        const deviceName = dev.deviceName || dev.vendor || '';
                        
                        addRow(slot, vid, did, deviceName);
                    });
                }
                // Handle single device object directly in the message
                else if (data.slot !== undefined && data.vid !== undefined && data.did !== undefined) {
                    const slot = data.slot || '';
                    const vid = data.vid || '';
                    const did = data.did || '';
                    const deviceName = data.deviceName || data.vendor || '';
                    
                    addRow(slot, vid, did, deviceName);
                }
            } catch (e) {
                console.error("Error parsing WebSocket message:", e);
            }
        };
    }
});
