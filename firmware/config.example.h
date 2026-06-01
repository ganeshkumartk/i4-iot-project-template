// Copy this file to config.h and fill in your values.
// config.h is gitignored — do not commit Wi-Fi credentials.

#pragma once

// ── Wi-Fi ──────────────────────────────────────────────────────────────────
// Option A — home / simple router (WPA2 password only):
//   WIFI_USE_ENTERPRISE false
//   WIFI_SSID + WIFI_PASSWORD
//
// Option B — IISc / institute network (WPA2-Enterprise, username + password):
//   WIFI_USE_ENTERPRISE true
//   WIFI_SSID + WIFI_IDENTITY + WIFI_USERNAME + WIFI_PASSWORD
//   (identity is often the same as username — use your IISc login ID)
//
// Workshop tip: if enterprise Wi-Fi blocks ESP32, use a facilitator phone hotspot
// or a small WPA2 travel router on the same LAN as the server laptop.

#define WIFI_USE_ENTERPRISE false

#define WIFI_SSID "YOUR_WIFI_SSID"

// PSK mode (WIFI_USE_ENTERPRISE false):
#define WIFI_PASSWORD "YOUR_WIFI_PASSWORD"

// Enterprise mode (WIFI_USE_ENTERPRISE true) — PEAP / MSCHAPv2:
#define WIFI_IDENTITY "your.username@iisc.ac.in"   // EAP identity (often = username)
#define WIFI_USERNAME "your.username@iisc.ac.in"  // EAP username
// WIFI_PASSWORD reused as EAP password (institute account password)

// ── Server (your computer's LAN IP, not localhost) ───────────────────────────
#define SERVER_HOST "192.168.1.100"
#define SERVER_PORT 3000
#define DEVICE_API_KEY ""  // optional; must match .env DEVICE_API_KEY

// ── Pins (GPIO 34 = moisture AO, GPIO 26 = relay via level shifter)
#define PIN_MOISTURE_AO 34   // D34 — ADC input-only
#define PIN_RELAY 26         // D26 — to logic level shifter LV1 → HV1 → relay IN

// ── Relay logic (kit boards: active LOW — LOW = ON, HIGH = OFF)
#define RELAY_ACTIVE_LOW true

// ── Moisture reading (10-sample average, 12-bit ADC)
#define MOISTURE_SAMPLES 10
#define MOISTURE_SAMPLE_DELAY_MS 50
#define MOISTURE_ADC_MAX 4095.0

#define USE_CALIBRATION false
#define MOISTURE_DRY_RAW 3500
#define MOISTURE_WET_RAW 1500

// ── Timing (milliseconds) ────────────────────────────────────────────────────
#define TELEMETRY_INTERVAL_MS 10000
#define WIFI_RETRY_MS 10000

// ── Device identity ──────────────────────────────────────────────────────────
#define DEVICE_ID "esp32-irrigation-01"
