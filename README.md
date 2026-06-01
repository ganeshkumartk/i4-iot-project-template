# Smart Irrigation System — IoT Hands-on Kit Template

Template repository for building a closed-loop smart irrigation system using the **Industry 4.0 IoT Hands-on Kit** components:

| Component | Qty | Role |
|-----------|-----|------|
| ESP32 DevKit V1 | 1 | Microcontroller, Wi-Fi, control logic |
| Soil Moisture Sensor board (YL-69) | 1 | Reads probe signal |
| Soil Moisture Probes | 1 | Measures soil moisture |
| Logic level shifter (4-ch) | 1 | 3.3 V → 5 V for relay IN |
| Relay Module (SRD-05VDC) | 1 | Switches pump on/off |
| DC Motor (pump) | 1 | Water delivery |
| Breadboards + jumper wires | — | Dual-rail prototyping (5 V + 3.3 V) |
| USB cable | 1 | Power & programming |

See [`docs/wiring.md`](docs/wiring.md) for the full bench layout with level shifter.

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

### 1. Wire the hardware

Follow the step-by-step guide: [`docs/wiring.md`](docs/wiring.md)

### 2. Configure credentials

```bash
cp .env.example .env
# Edit .env with your Wi-Fi SSID/password and server IP
```

Copy `firmware/config.example.h` → `firmware/config.h` and fill in the same values.

### 3. Flash the ESP32

**Option A — Arduino IDE**

1. Install [Arduino IDE](https://www.arduino.cc/en/software) and the [ESP32 board support](https://docs.espressif.com/projects/arduino-esp32/en/latest/installing.html).
2. Install libraries: **ArduinoJson** (via Library Manager).
3. Open `firmware/smart_irrigation.ino`, set board to **ESP32 Dev Module**, select your port, and upload.

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

Open **http://localhost:3000** for the dashboard.

### 5. Point ESP32 at your server

Set `SERVER_HOST` in `firmware/config.h` to your computer's LAN IP (e.g. `192.168.1.42`), not `localhost`.

Find your IP:

```bash
# macOS / Linux
ipconfig getifaddr en0   # or: hostname -I
```

## Printable Wiring Card

Open **`docs/wiring-card.html`** in a browser and click **Print wiring card** for a one-page A4 reference (pin map, schematic, checklist). When the server is running it is also at:

**http://localhost:3000/docs/wiring-card.html**

## Project Structure

```
smart-irrigation/
├── docs/
│   ├── wiring.md          # Pin map, schematics, safety notes
│   └── wiring-card.html   # One-page printable wiring reference
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
└── README.md
```

## API Reference

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/state` | Current system state (moisture, pump, mode) |
| `POST` | `/api/telemetry` | ESP32 posts sensor readings |
| `GET` | `/api/commands` | ESP32 polls for pending commands |
| `POST` | `/api/control` | Dashboard sets pump/mode/thresholds |
| `WS` | `/` | Realtime state broadcast to browsers |

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

| File | Format |
|------|--------|
| `data/telemetry-<session>.csv` | Spreadsheet / pandas |
| `data/telemetry-<session>.jsonl` | One JSON object per line |

Configure in `.env`:

```bash
DATA_LOGGING=true
DATA_SESSION_ID=20260602-iisc-workshop   # optional; defaults to today's date
```

**Export after the workshop:**

| URL | Use |
|-----|-----|
| `GET /api/data/export.csv` | Download CSV for Excel / pandas |
| `GET /api/data/export.jsonl` | Download JSONL |
| `GET /api/data/history` | JSON array in browser |
| `GET /api/data/info` | Current session filenames |

**Quick pandas load:**

```python
import pandas as pd
df = pd.read_csv("data/telemetry-20260602-iisc-workshop.csv", parse_dates=["timestamp"])
```

CSV columns: `timestamp`, `deviceId`, `moistureRaw`, `moisturePercent`, `pumpOn`, `mode`, `rssi`, `uptimeMs`, `dryThreshold`, `wetThreshold`.

Logged files are gitignored — copy exports before deleting the `data/` folder.

## Troubleshooting

| Issue | Fix |
|-------|-----|
| ESP32 won't connect to Wi-Fi | PSK: SSID/password in `config.h`. IISc: set `WIFI_USE_ENTERPRISE true` + username/password. Try phone hotspot if institute network blocks ESP32 |
| Dashboard shows "Disconnected" | Server not running, or wrong IP in ESP32 config |
| Moisture reads 0% or 100% | Check wiring on GPIO 34; default formula assumes 12-bit ADC — set `USE_CALIBRATION true` in config.h if needed |
| Relay clicks but pump doesn't run | Pump on relay COM/NO with 5 V rail; check level shifter HV1 → relay IN |
| Pump runs when it shouldn't | Active LOW relay — boot sets GPIO 26 HIGH; verify level shifter direction |

## License

MIT — D-CoE IISc Industry 4.0 workshop template.
