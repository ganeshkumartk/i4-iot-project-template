# Smart Irrigation System — IoT Hands-on Kit Template

Template repository for building a closed-loop smart irrigation system using the **Industry 4.0 IoT Hands-on Kit** components:


| Component                          | Qty | Role                                  |
| ---------------------------------- | --- | ------------------------------------- |
| ESP32 DevKit V1                    | 1   | Microcontroller, Wi-Fi, control logic |
| Soil Moisture Sensor board (YL-69) | 1   | Reads probe signal                    |
| Soil Moisture Probes               | 1   | Measures soil moisture                |
| Logic level shifter (4-ch)         | 1   | 3.3 V → 5 V for relay IN              |
| Relay Module (SRD-05VDC)           | 1   | Switches pump on/off                  |
| DC Motor (pump)                    | 1   | Water delivery                        |
| Breadboards + jumper wires         | —   | Dual-rail prototyping (5 V + 3.3 V)   |
| USB cable                          | 1   | Power & programming                   |


See `[docs/wiring.md](docs/wiring.md)` for the full bench layout with level shifter.

## Architecture

```
┌─────────────┐   HTTP (telemetry + commands)   ┌──────────────────┐   WebSocket   ┌─────────────┐
│   ESP32     │ ◄──────────────────────────────►│  Node.js Server  │◄─────────────►│  Dashboard  │
│  + sensors  │                                 │  (port 3000)     │               │  (browser)  │
│  + relay    │                                 └──────────────────┘               └─────────────┘
└─────────────┘
```

- **ESP32** reads soil moisture, controls the relay/pump, and syncs with the server every few seconds.
- **Server** stores the latest state and pushes realtime updates to connected dashboards.
- **Dashboard** shows moisture, pump status, and lets you switch between auto/manual irrigation.

## Quick Start

> **Windows users:** See **[docs/setup-windows.md](docs/setup-windows.md)**  
>
> 1. `scripts\install-all-deps-windows.bat` (Node.js + Python + package dependencies)
> 2. `scripts\setup.bat` → `scripts\start-server.bat`

### 1. Wire the hardware

Follow the step-by-step guide: `[docs/wiring.md](docs/wiring.md)`

### 2. Configure credentials

**macOS / Linux / Windows (terminal):**

```bash
npm run setup
```

This copies `.env.example` → `.env` and `firmware/config.example.h` → `firmware/config.h`, then prints your suggested LAN IP.

**Windows (double-click):** run `scripts\setup.bat`

Edit `firmware/config.h` — set Wi-Fi credentials and `SERVER_HOST` to the IP shown (not `localhost`).

**Manual copy:**

```bash
# macOS / Linux
cp .env.example .env
cp firmware/config.example.h firmware/config.h
```

```cmd
REM Windows Command Prompt
copy .env.example .env
copy firmware\config.example.h firmware\config.h
```

```powershell
# Windows PowerShell
Copy-Item .env.example .env
Copy-Item firmware\config.example.h firmware\config.h
```

### 3. Flash the ESP32

**Option A — Arduino IDE**

1. Install [Arduino IDE](https://www.arduino.cc/en/software) and the [ESP32 board support](https://docs.espressif.com/projects/arduino-esp32/en/latest/installing.html).
2. Install libraries: **ArduinoJson** (via Library Manager).
3. Open `firmware/smart_irrigation.ino`, set board to **ESP32 Dev Module**, select your port, and upload.

  | OS      | Port name                                                                          |
  | ------- | ---------------------------------------------------------------------------------- |
  | Windows | **COM3**, COM4, … (Device Manager → Ports; install CH340/CP210x driver if missing) |
  | macOS   | `/dev/cu.usbserial-`* or `/dev/cu.SLAB_USBtoUART`                                  |
  | Linux   | `/dev/ttyUSB0` or `/dev/ttyACM0`                                                   |


**Option B — PlatformIO**

```bash
cd firmware
pio run -t upload
```

### 4. Start the server

```bash
npm install
npm start
```

Open **[http://localhost:3000](http://localhost:3000)** for the dashboard.
Open **[http://localhost:3000/ml.html](http://localhost:3000/ml.html)** for ML analysis/training visuals.

### 5. Point ESP32 at your server

Set `SERVER_HOST` in `firmware/config.h` to your computer's LAN IP (e.g. `192.168.1.42`), not `localhost`.

Find your IP for `SERVER_HOST`:

```bash
# macOS
ipconfig getifaddr en0

# Linux
hostname -I | awk '{print $1}'

# Windows — Command Prompt
ipconfig

# Windows — PowerShell
(Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -match 'Wi-Fi|Ethernet' }).IPAddress
```

Or run `npm run setup` — it prints a suggested IP automatically.

**Windows firewall:** Allow Node.js on private networks when prompted (port 3000) so ESP32 devices can reach the server. See [docs/setup-windows.md](docs/setup-windows.md).

## Printable Wiring Card

Open `**docs/wiring-card.html`** in a browser and click **Print wiring card** for a one-page A4 reference (pin map, schematic, checklist). When the server is running it is also at:

**[http://localhost:3000/docs/wiring-card.html](http://localhost:3000/docs/wiring-card.html)**

## Project Structure

```
smart-irrigation/
├── docs/
│   ├── setup-windows.md   # Windows step-by-step (students)
│   ├── wiring.md          # Pin map, schematics, safety notes
│   └── wiring-card.html   # One-page printable wiring reference
├── scripts/
│   ├── setup.js                  # Cross-platform setup (npm run setup)
│   ├── analyze-ml.js             # CLI baseline ML analysis
│   ├── install-node-windows.bat  # Install Node.js LTS (Windows)
│   ├── install-node-windows.ps1
│   ├── install-all-deps-windows.bat  # Node + Python + package dependencies
│   ├── install-all-deps-windows.ps1
│   ├── setup.bat                 # Windows project setup
│   ├── setup.ps1                 # Windows PowerShell setup + IP list
│   └── start-server.bat          # Windows start server
├── firmware/
│   ├── smart_irrigation.ino
│   ├── config.example.h   # Copy to config.h (gitignored)
│   └── platformio.ini     # Optional PlatformIO config
├── server/
│   ├── index.js           # Express + WebSocket API
│   └── public/
│       ├── index.html     # Dashboard UI
│       ├── styles.css
│       └── app.js         # Realtime client
├── .env.example
├── package.json
├── requirements-ml.txt
└── README.md
```

## API Reference


| Method | Path             | Description                                 |
| ------ | ---------------- | ------------------------------------------- |
| `GET`  | `/api/state`     | Current system state (moisture, pump, mode) |
| `POST` | `/api/telemetry` | ESP32 posts sensor readings                 |
| `GET`  | `/api/commands`  | ESP32 polls for pending commands            |
| `POST` | `/api/control`   | Dashboard sets pump/mode/thresholds         |
| `WS`   | `/`              | Realtime state broadcast to browsers        |


## Auto vs Manual Mode

- **Auto** — Pump turns ON when moisture drops below `dryThreshold`; turns OFF above `wetThreshold`.
- **Manual** — Pump follows dashboard ON/OFF until you switch back to auto.

Default thresholds (configurable in dashboard): dry = 35%, wet = 65%.

## Wi-Fi setup (IISc / enterprise networks)

IISc Wi-Fi uses **WPA2-Enterprise** — a **username and password** (institute account), not a simple shared Wi-Fi password alone.

In `firmware/config.h`:

```cpp
#define WIFI_USE_ENTERPRISE true
#define WIFI_SSID "IISc-WiFi-Name"              // exact SSID from IT
#define WIFI_IDENTITY "your.id@iisc.ac.in"      // usually same as username
#define WIFI_USERNAME "your.id@iisc.ac.in"
#define WIFI_PASSWORD "your-institute-password"
```

For a **home router or phone hotspot**, keep `WIFI_USE_ENTERPRISE false` and set only `WIFI_SSID` + `WIFI_PASSWORD`.

**Workshop fallback:** Enterprise networks sometimes block ESP32 devices (certificates, MAC filtering). If connection fails after 20 s in Serial Monitor, use a **facilitator phone hotspot** or a small **WPA2 travel router** on the same LAN as the server laptop. ESP32 and laptop must reach each other on `SERVER_HOST`.

## Data logging (analytics / ML sessions)

Every telemetry POST is appended to session files under `data/`:


| File                             | Format                   |
| -------------------------------- | ------------------------ |
| `data/telemetry-<session>.csv`   | Spreadsheet / pandas     |
| `data/telemetry-<session>.jsonl` | One JSON object per line |


Configure in `.env`:

```bash
DATA_LOGGING=true
DATA_SESSION_ID=20260602-iisc-workshop   # optional; defaults to today's date
```

**Export after the workshop:**


| URL                          | Use                             |
| ---------------------------- | ------------------------------- |
| `GET /api/data/export.csv`   | Download CSV for Excel / pandas |
| `GET /api/data/export.jsonl` | Download JSONL                  |
| `GET /api/data/history`      | JSON array in browser           |
| `GET /api/data/info`         | Current session filenames       |


**Quick pandas load:**

```python
import pandas as pd
df = pd.read_csv("data/telemetry-20260602-iisc-workshop.csv", parse_dates=["timestamp"])
```

CSV columns: `timestamp`, `deviceId`, `moistureRaw`, `moisturePercent`, `pumpOn`, `mode`, `rssi`, `uptimeMs`, `dryThreshold`, `wetThreshold`.

Logged files are gitignored — copy exports before deleting the `data/` folder.

Run baseline analytics/ML summary on telemetry data:

```bash
npm run analyze:ml -- --input data/telemetry-<session>.csv
```

Run synthetic fallback explicitly (useful for lab demos without logged CSV):

```bash
npm run analyze:ml -- --source synthetic
```

Web ML analysis API and UI:

- `GET /api/ml/analysis` (auto: latest CSV or synthetic fallback)
- `GET /api/ml/analysis?source=synthetic` (force synthetic lab data)
- `http://localhost:3000/ml.html` (visual training + evaluation dashboard)

See [docs/analytics-ml.md](docs/analytics-ml.md) for full workflow, preprocessing, training, and evaluation details.

## Troubleshooting


| Issue                             | Fix                                                                                                                                             |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm` not recognized (Windows)    | Run `**scripts\install-node-windows.bat**`, restart terminal, or install LTS from [https://nodejs.org/](https://nodejs.org/)                    |
| ESP32 port missing (Windows)      | Install CP210x or CH340 USB driver; check Device Manager → Ports                                                                                |
| Firewall blocks ESP32 (Windows)   | Allow Node.js inbound on port 3000 — see `docs/setup-windows.md`                                                                                |
| ESP32 won't connect to Wi-Fi      | PSK: SSID/password in `config.h`. IISc: set `WIFI_USE_ENTERPRISE true` + username/password. Try phone hotspot if institute network blocks ESP32 |
| Dashboard shows "Disconnected"    | Server not running, or wrong IP in ESP32 config                                                                                                 |
| Moisture reads 0% or 100%         | Check wiring on GPIO 34; default formula assumes 12-bit ADC — set `USE_CALIBRATION true` in config.h if needed                                  |
| Relay clicks but pump doesn't run | Pump on relay COM/NO with 5 V rail; check level shifter HV1 → relay IN                                                                          |
| Pump runs when it shouldn't       | Active LOW relay — boot sets GPIO 26 HIGH; verify level shifter direction                                                                       |


## License

MIT — D-CoE IISc Industry 4.0 workshop template.