# Windows setup — Smart Irrigation IoT kit

Step-by-step for **Windows 10/11** students and facilitators.

## Prerequisites

| Software | How to install |
|----------|----------------|
| **Node.js 18+ (LTS)** | Double-click **`scripts\install-node-windows.bat`** — or https://nodejs.org/ |
| **Arduino IDE 2.x** | https://www.arduino.cc/en/software |
| **ESP32 USB driver** | CH340 or CP210x (see Device Manager if port missing) |

### Install Node.js (automated)

1. Double-click **`scripts\install-node-windows.bat`**
2. Approve the **Administrator (UAC)** prompt if Windows asks
3. The script tries **winget** first, then downloads the **LTS MSI** from nodejs.org
4. When done, run **`scripts\setup.bat`**

PowerShell (alternative):

```powershell
powershell -ExecutionPolicy Bypass -File scripts\install-node-windows.ps1
```

Verify:

```cmd
node -v
npm -v
```

You need **Node 18+**. If `node` is not recognized after install, **close and reopen** Command Prompt.

## Quick setup (double-click)

1. Clone or download this repo and unzip.
2. **`scripts\install-node-windows.bat`** — if Node.js is not installed yet.
3. **`scripts\setup.bat`** — creates `firmware\config.h` and `.env`.
4. **`scripts\start-server.bat`** — installs npm packages and starts the dashboard.

Or in **PowerShell** from the project folder:

```powershell
node scripts/setup.js
npm install
npm start
```

## Find your PC IP (for ESP32 `SERVER_HOST`)

The ESP32 must reach your laptop by **LAN IP**, not `localhost`.

**Option A — PowerShell**

```powershell
Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -match 'Wi-Fi|Ethernet' } | Select IPAddress, InterfaceAlias
```

**Option B — Command Prompt**

```cmd
ipconfig
```

Look for **Wireless LAN adapter Wi-Fi** or **Ethernet adapter** → **IPv4 Address** (e.g. `192.168.1.42`).

Put that value in `firmware\config.h`:

```cpp
#define SERVER_HOST "192.168.1.42"
```

## Configure Wi-Fi in `firmware\config.h`

### Phone hotspot / home router

```cpp
#define WIFI_USE_ENTERPRISE false
#define WIFI_SSID "YourNetworkName"
#define WIFI_PASSWORD "your-password"
```

### IISc (username + password)

```cpp
#define WIFI_USE_ENTERPRISE true
#define WIFI_SSID "IISc-SSID"
#define WIFI_IDENTITY "your.id@iisc.ac.in"
#define WIFI_USERNAME "your.id@iisc.ac.in"
#define WIFI_PASSWORD "institute-password"
```

## Flash ESP32 (Arduino IDE on Windows)

1. **File → Preferences → Additional boards manager URLs** — add:
   ```
   https://espressif.github.io/arduino-esp32/package_esp32_index.json
   ```
2. **Tools → Board → Boards Manager** — search **esp32**, install **esp32 by Espressif**.
3. **Sketch → Include Library → Manage Libraries** — install **ArduinoJson**.
4. **File → Open** → `firmware\smart_irrigation.ino`
5. **Tools → Board** → **ESP32 Dev Module**
6. **Tools → Port** → **COM3** (or similar — check Device Manager → Ports)
7. Click **Upload**
8. **Tools → Serial Monitor** → **115200 baud** → look for `TX: OK`

### Driver issues

| Symptom | Fix |
|---------|-----|
| No COM port | Install [CP210x](https://www.silabs.com/developers/usb-to-uart-bridge-vcp-drivers) or CH340 driver |
| Upload timeout | Hold **BOOT** on ESP32, click Upload, release when "Connecting..." appears |
| Wrong port | Unplug ESP32, note which COM port disappears in Device Manager |

## Windows Firewall

When `npm start` runs the first time, allow **Node.js** on **Private networks** so ESP32 devices on the same Wi-Fi can POST to port **3000**.

Manual rule (PowerShell as Administrator):

```powershell
New-NetFirewallRule -DisplayName "Smart Irrigation Node" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow
```

## Paths and folders

Use backslashes in Explorer; Arduino and Node accept forward slashes too.

```
smart-irrigation\
├── firmware\config.h           ← edit this (created from config.example.h)
├── scripts\install-node-windows.bat   ← install Node.js LTS (first time)
├── scripts\setup.bat           ← project config setup
├── scripts\start-server.bat    ← run dashboard server
└── data\                       ← CSV logs appear here after telemetry
```

## Open dashboard & export data

| URL | Purpose |
|-----|---------|
| http://localhost:3000 | Dashboard |
| http://localhost:3000/docs/wiring-card.html | Wiring card |
| http://localhost:3000/api/data/export.csv | Download sensor log |

Replace `localhost` with your PC IP when opening from another device on the same network.

## Common Windows issues

| Issue | Fix |
|-------|-----|
| `npm` not recognized | Run **`scripts\install-node-windows.bat`**, restart terminal, or install LTS from https://nodejs.org/ |
| `ExecutionPolicy` blocks `.ps1` | Use `.bat` files, or `powershell -ExecutionPolicy Bypass -File scripts\setup.ps1` |
| Dashboard OK, ESP32 offline | Wrong `SERVER_HOST`; firewall blocking 3000; different Wi-Fi bands |
| Moisture wrong | Check AO → GPIO 34; sensor on 3.3 V |

## macOS / Linux

See main [README](../README.md) — use `node scripts/setup.js` and `ipconfig getifaddr en0` (macOS) or `hostname -I` (Linux).
