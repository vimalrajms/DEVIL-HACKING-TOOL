// ==========================================
// DEVIL CYBERSECURITY TOOLKIT
// Frontend JavaScript
// ==========================================

// Website and backend same PC-la run pannina localhost use pannu.
// Vera phone / PC-la open panna, un PC-oda LAN IP use pannanum.
const LOCAL_API = "http://127.0.0.1:8000";
const ONLINE_API = "https://devil-hacking-tool.onrender.com";

const API_BASE = window.location.hostname === "localhost" ||
window.location.hostname === "127.0.0.1"
? LOCAL_API
: ONLINE_API;


const getElement = (id) => document.getElementById(id);

// ==========================================
// BACKEND STATUS
// ==========================================

function updateBackendStatus(online, message) {
    const badge = document.querySelector(".connection-badge");
    const dot = getElement("backendDot");
    const status = getElement("backendStatus");
    const apiStatus = getElement("apiStatus");
    const apiDetail = getElement("apiDetail");

    if (status) {
        status.textContent = online
            ? "Backend: Online"
            : "Backend: Offline";
    }

    if (dot) {
        dot.classList.toggle("online", online);
    }

    if (badge) {
        badge.classList.toggle("online", online);
    }

    if (apiStatus) {
        apiStatus.textContent = online ? "ONLINE" : "OFFLINE";
    }

    if (apiDetail) {
        apiDetail.textContent = message;
    }
}

async function checkBackend() {
    try {
        const response = await fetch(
            `${API_BASE}/api/health`,
            { cache: "no-store" }
        );

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();

        updateBackendStatus(
            true,
            `API connected • ${new Date(data.time || Date.now()).toLocaleTimeString()}`
        );

        return true;
    } catch (error) {
        updateBackendStatus(
            false,
            "Start the Python backend and check the API address."
        );

        console.error("DEVIL backend error:", error.message);

        return false;
    }
}

// ==========================================
// ESP32 DEVICE STATUS
// ==========================================

async function refreshDeviceStatus() {
    try {
        const response = await fetch(
            `${API_BASE}/api/device/status`,
            { cache: "no-store" }
        );

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const device = await response.json();

        const online = device.online === true;

        getElement("espStatus").textContent =
            online ? "ONLINE" : "OFFLINE";

        getElement("espDetail").textContent =
            online
                ? "ESP32 heartbeat received"
                : "Waiting for ESP32 heartbeat";

        getElement("deviceName").textContent =
            device.name || "Not connected";

        getElement("deviceIp").textContent =
            device.ip || "—";

        getElement("deviceUptime").textContent =
            online
                ? `${device.uptime_seconds || 0} seconds`
                : "—";

        getElement("oledStatus").textContent =
            online
                ? (device.oled ? "Connected" : "Not detected")
                : "—";

        getElement("lastHeartbeat").textContent =
            device.last_seen
                ? new Date(device.last_seen).toLocaleString()
                : "Never";

    } catch (error) {
        getElement("espStatus").textContent = "UNKNOWN";

        getElement("espDetail").textContent =
            "Unable to retrieve device status.";

        console.error("ESP32 status error:", error.message);
    }
}

// ==========================================
// NEARBY WI-FI RESULTS
// ==========================================

function showWifiMessage(message) {
    const tbody = getElement("wifiResults");

    if (!tbody) {
        return;
    }

    tbody.replaceChildren();

    const row = document.createElement("tr");
    const cell = document.createElement("td");

    cell.colSpan = 4;
    cell.className = "empty-state";
    cell.textContent = message;

    row.appendChild(cell);
    tbody.appendChild(row);
}

function renderWifiResults(networks) {
    const tbody = getElement("wifiResults");

    if (!tbody) {
        return;
    }

    tbody.replaceChildren();

    if (!Array.isArray(networks) || networks.length === 0) {
        showWifiMessage("No Wi-Fi networks found in the latest scan.");
        return;
    }

    networks.forEach((network) => {
        const row = document.createElement("tr");

        const nameCell = document.createElement("td");
        nameCell.textContent =
            network.ssid || "(Hidden network)";

        const signalCell = document.createElement("td");
        const rssi = Number(network.rssi);

        signalCell.textContent =
            Number.isFinite(rssi) ? `${rssi} dBm` : "—";

        const channelCell = document.createElement("td");
        channelCell.textContent =
            network.channel ?? "—";

        const securityCell = document.createElement("td");
        securityCell.textContent =
            network.security || "Unknown";

        row.append(
            nameCell,
            signalCell,
            channelCell,
            securityCell
        );

        tbody.appendChild(row);
    });
}

async function refreshWifiResults() {
    const status = getElement("wifiScanStatus");

    if (status) {
        status.textContent = "Checking for available scan results...";
    }

    try {
        const response = await fetch(
            `${API_BASE}/api/wifi/results`,
            { cache: "no-store" }
        );

        if (response.status === 404) {
            throw new Error(
                "Wi-Fi results API is not implemented in the backend yet."
            );
        }

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();

        renderWifiResults(data.networks || []);

        if (status) {
            status.textContent =
                `Showing ${(data.networks || []).length} network results.`;
        }

    } catch (error) {
        showWifiMessage("No scan results available yet.");

        if (status) {
            status.textContent = error.message;
        }

        console.info("Wi-Fi results:", error.message);
    }
}

async function startWifiScan() {
    const button = getElement("scanButton");
    const status = getElement("wifiScanStatus");

    if (button) {
        button.disabled = true;
        button.textContent = "Requesting scan...";
    }

    try {
        const response = await fetch(
            `${API_BASE}/api/wifi/scan`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    source: "esp32"
                })
            }
        );

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(
                data.detail || `HTTP ${response.status}`
            );
        }

        if (status) {
            status.textContent =
                data.message ||
                "Scan requested. Wait for ESP32 scan results.";
        }

        // ESP32 scanning may take several seconds.
        window.setTimeout(refreshWifiResults, 4000);

    } catch (error) {
        if (status) {
            status.textContent =
                `Scan unavailable: ${error.message}`;
        }

        console.info("Wi-Fi scan:", error.message);

    } finally {
        if (button) {
            button.disabled = false;
            button.textContent = "Scan Nearby Wi-Fi";
        }
    }
}

// ==========================================
// HTTPS CERTIFICATE CHECKER
// ==========================================

async function checkHttpsCertificate(event) {
    event.preventDefault();

    const input = getElement("httpsUrl");
    const result = getElement("httpsResult");
    const button = getElement("httpsButton");

    if (!input || !result) {
        return;
    }

    const url = input.value.trim();

    if (!url.toLowerCase().startsWith("https://")) {
        result.textContent =
            "Please enter a complete HTTPS URL.";
        return;
    }

    button.disabled = true;
    button.textContent = "Checking...";
    result.textContent = "Checking HTTPS certificate...";

    try {
        const response = await fetch(
            `${API_BASE}/api/security/https-check`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ url })
            }
        );

        const data = await response.json();

        if (!response.ok) {
            throw new Error(
                data.detail || `HTTP ${response.status}`
            );
        }

        result.textContent = JSON.stringify(data, null, 2);

    } catch (error) {
        result.textContent =
            `Certificate check failed: ${error.message}`;

    } finally {
        button.disabled = false;
        button.textContent = "Check Certificate";
    }
}

// ==========================================
// PASSWORD STRENGTH ANALYZER
// Runs locally in the browser.
// Password is never sent to the backend.
// ==========================================

function analyzePassword() {
    const input = getElement("passwordInput");
    const result = getElement("passwordResult");
    const bar = getElement("strengthBar");

    if (!input || !result || !bar) {
        return;
    }

    const password = input.value;

    if (!password) {
        result.textContent = "Enter a sample password to analyze.";
        bar.style.width = "0%";
        return;
    }

    let score = 0;

    if (password.length >= 12) score++;
    if (password.length >= 16) score++;
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
    if (/\d/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;

    if (/password|qwerty|123456|letmein|admin/i.test(password)) {
        score = Math.min(score, 1);
    }

    const labels = [
        "Very weak",
        "Weak",
        "Fair",
        "Good",
        "Strong",
        "Very strong"
    ];

    result.textContent =
        `${labels[score]} • ${password.length} characters. ` +
        "Use a unique password for each account.";

    bar.style.width = `${score * 20}%`;

    if (score <= 1) {
        bar.style.background = "#ff123f";
    } else if (score <= 3) {
        bar.style.background = "#ffb020";
    } else {
        bar.style.background = "#00ff9d";
    }
}

// ==========================================
// INITIALIZE DASHBOARD
// ==========================================

document.addEventListener("DOMContentLoaded", () => {
    const httpsForm = getElement("httpsForm");
    const passwordInput = getElement("passwordInput");
    const scanButton = getElement("scanButton");
    const refreshWifiButton = getElement("refreshWifiButton");
    const refreshDeviceButton = getElement("refreshDeviceButton");

    if (httpsForm) {
        httpsForm.addEventListener(
            "submit",
            checkHttpsCertificate
        );
    }

    if (passwordInput) {
        passwordInput.addEventListener(
            "input",
            analyzePassword
        );
    }

    if (scanButton) {
        scanButton.addEventListener(
            "click",
            startWifiScan
        );
    }

    if (refreshWifiButton) {
        refreshWifiButton.addEventListener(
            "click",
            refreshWifiResults
        );
    }

    if (refreshDeviceButton) {
        refreshDeviceButton.addEventListener(
            "click",
            refreshDeviceStatus
        );
    }

    checkBackend();
    refreshDeviceStatus();
    refreshWifiResults();

    window.setInterval(checkBackend, 10000);
    window.setInterval(refreshDeviceStatus, 5000);
});