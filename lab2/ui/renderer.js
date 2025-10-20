document.addEventListener('DOMContentLoaded', () => {
    const startBtn = document.getElementById('start-btn');
    const startScreen = document.getElementById('start-screen');
    const mainContent = document.getElementById('main-content');
    const videoBg = document.getElementById('video-bg');
    const videoBgMain = document.getElementById('video-bg-main');
    const pciBody = document.getElementById('pci-body');

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

    function addRow(slot, vid, did, vendorName) {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="padding:8px;border-bottom:1px solid rgba(255,255,255,0.06)">${slot}</td>
            <td style="padding:8px;border-bottom:1px solid rgba(255,255,255,0.06)">${vid}</td>
            <td style="padding:8px;border-bottom:1px solid rgba(255,255,255,0.06)">${did}</td>
            <td style="padding:8px;border-bottom:1px solid rgba(255,255,255,0.06)">${vendorName}</td>
        `;
        pciBody.appendChild(tr);
    }

    function parseLine(line) {
        // Expect either JSON {slot, vid, did, vendor} or raw lines like "[0000:00:1f.0] VEN_8086 DEV_9d71 ..."
        try {
            const obj = JSON.parse(line);
            if (obj.slot && obj.vid && obj.did) {
                addRow(obj.slot, obj.vid, obj.did, obj.vendor || '');
                return;
            }
        } catch (e) {
            // not JSON
        }

        // Fallback parsing
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

        socket.onopen = () => console.log('WS open');
        socket.onclose = () => console.log('WS closed');
        socket.onerror = (e) => console.error('WS error', e);

        socket.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.line) {
                    parseLine(data.line);
                } else if (Array.isArray(data.devices)) {
                    // Some backends may send full device arrays
                    pciBody.innerHTML = '';
                    data.devices.forEach((dev, idx) => addRow(idx+1, dev.vid, dev.did, dev.vendor || ''));
                } else if (data.slot && data.vid && data.did) {
                    addRow(data.slot, data.vid, data.did, data.vendor || '');
                } else {
                    console.debug('Unhandled WS payload', data);
                }
            } catch (e) {
                // message may be raw line
                parseLine(event.data);
            }
        };
    }
});
