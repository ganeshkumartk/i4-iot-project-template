/*
 * Smart Irrigation — ESP32 Firmware
 *
 * Pins: GPIO 34 = moisture AO, GPIO 26 = relay (via logic level shifter)
 * Relay: active LOW (LOW = pump ON, HIGH = pump OFF)
 *
 * Setup: copy config.example.h → config.h, install ArduinoJson library.
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include "config.h"

#if WIFI_USE_ENTERPRISE
#include "esp_wifi.h"  // WPA2-Enterprise (IISc username + password)
#endif

// ── Runtime state (synced from server) ───────────────────────────────────────
enum Mode { MODE_AUTO, MODE_MANUAL };

struct SystemState {
  Mode mode = MODE_AUTO;
  bool pumpOn = false;
  int dryThreshold = 35;
  int wetThreshold = 65;
} state;

unsigned long lastTelemetry = 0;
unsigned long lastCommandPoll = 0;
const unsigned long COMMAND_POLL_MS = 2000;

const char* wifiStatusText(wl_status_t status) {
  switch (status) {
    case WL_IDLE_STATUS: return "IDLE";
    case WL_NO_SSID_AVAIL: return "NO_SSID";
    case WL_SCAN_COMPLETED: return "SCAN_DONE";
    case WL_CONNECTED: return "CONNECTED";
    case WL_CONNECT_FAILED: return "CONNECT_FAILED";
    case WL_CONNECTION_LOST: return "CONNECTION_LOST";
    case WL_DISCONNECTED: return "DISCONNECTED";
    default: return "UNKNOWN";
  }
}

// ── Relay (active LOW) ───────────────────────────────────────────────────────
void setPump(bool on) {
  state.pumpOn = on;
  if (RELAY_ACTIVE_LOW) {
    digitalWrite(PIN_RELAY, on ? LOW : HIGH);
  } else {
    digitalWrite(PIN_RELAY, on ? HIGH : LOW);
  }
}

// ── Moisture reading (10-sample average on GPIO 34) ──────────────────────────
int readMoistureRaw() {
  long sum = 0;
  for (int i = 0; i < MOISTURE_SAMPLES; i++) {
    sum += analogRead(PIN_MOISTURE_AO);
    delay(MOISTURE_SAMPLE_DELAY_MS);
  }
  return sum / MOISTURE_SAMPLES;
}

int rawToPercent(int raw) {
#if USE_CALIBRATION
  int dry = MOISTURE_DRY_RAW;
  int wet = MOISTURE_WET_RAW;
  if (dry == wet) return 50;
  int pct = map(raw, dry, wet, 0, 100);
  return constrain(pct, 0, 100);
#else
  // Higher raw = drier → invert to moisture %
  int pct = (int)(100.0 - ((raw / MOISTURE_ADC_MAX) * 100.0));
  return constrain(pct, 0, 100);
#endif
}

void applyAutoLogic(int moisturePct) {
  if (state.mode != MODE_AUTO) return;

  if (moisturePct < state.dryThreshold && !state.pumpOn) {
    setPump(true);
    Serial.printf("[AUTO] Moisture %d%% < %d%% → pump ON\n", moisturePct, state.dryThreshold);
  } else if (moisturePct > state.wetThreshold && state.pumpOn) {
    setPump(false);
    Serial.printf("[AUTO] Moisture %d%% > %d%% → pump OFF\n", moisturePct, state.wetThreshold);
  }
}

// ── HTTP helpers ─────────────────────────────────────────────────────────────
String serverUrl(const char* path) {
  return String("http://") + SERVER_HOST + ":" + SERVER_PORT + path;
}

bool postTelemetry(int raw, int pct) {
  if (WiFi.status() != WL_CONNECTED) return false;

  HTTPClient http;
  String url = serverUrl("/api/telemetry");
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  if (strlen(DEVICE_API_KEY) > 0) {
    http.addHeader("X-Device-Key", DEVICE_API_KEY);
  }

  StaticJsonDocument<256> doc;
  doc["deviceId"] = DEVICE_ID;
  doc["moistureRaw"] = raw;
  doc["moisturePercent"] = pct;
  doc["soilMoisture"] = pct;
  doc["pumpOn"] = state.pumpOn;
  doc["mode"] = state.mode == MODE_AUTO ? "auto" : "manual";
  doc["rssi"] = WiFi.RSSI();
  doc["uptimeMs"] = millis();

  String body;
  serializeJson(doc, body);
  int code = http.POST(body);
  http.end();

  return code >= 200 && code < 300;
}

bool pollCommands() {
  if (WiFi.status() != WL_CONNECTED) return false;

  HTTPClient http;
  String url = serverUrl("/api/commands?deviceId=" + String(DEVICE_ID));
  http.begin(url);
  if (strlen(DEVICE_API_KEY) > 0) {
    http.addHeader("X-Device-Key", DEVICE_API_KEY);
  }

  int code = http.GET();
  if (code != 200) {
    http.end();
    return false;
  }

  String payload = http.getString();
  http.end();

  StaticJsonDocument<512> doc;
  if (deserializeJson(doc, payload)) return false;

  if (doc.containsKey("mode")) {
    const char* m = doc["mode"];
    state.mode = (strcmp(m, "manual") == 0) ? MODE_MANUAL : MODE_AUTO;
  }
  if (doc.containsKey("dryThreshold")) {
    state.dryThreshold = doc["dryThreshold"].as<int>();
  }
  if (doc.containsKey("wetThreshold")) {
    state.wetThreshold = doc["wetThreshold"].as<int>();
  }
  if (doc.containsKey("pumpOn") && state.mode == MODE_MANUAL) {
    setPump(doc["pumpOn"].as<bool>());
  }

  return true;
}

// ── Wi-Fi ────────────────────────────────────────────────────────────────────
void connectWiFi() {
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("[WiFi] Already connected");
    return;
  }

  Serial.printf("[WiFi] Preparing station mode for SSID: %s\n", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.persistent(false);
  WiFi.setAutoReconnect(true);
  WiFi.disconnect(true, true);
  delay(300);

#if WIFI_USE_ENTERPRISE
  Serial.println("[WiFi] Auth mode: WPA2-Enterprise (identity/username/password)");
  // WPA2-Enterprise (IISc / institute networks — username + password)
  esp_wifi_sta_wpa2_ent_enable();
  esp_wifi_sta_wpa2_ent_set_identity((uint8_t *)WIFI_IDENTITY, strlen(WIFI_IDENTITY));
  esp_wifi_sta_wpa2_ent_set_username((uint8_t *)WIFI_USERNAME, strlen(WIFI_USERNAME));
  esp_wifi_sta_wpa2_ent_set_password((uint8_t *)WIFI_PASSWORD, strlen(WIFI_PASSWORD));
  WiFi.begin(WIFI_SSID);
#else
  Serial.println("[WiFi] Auth mode: WPA2-PSK (SSID + password)");
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
#endif

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 40) {
    delay(500);
    wl_status_t status = WiFi.status();
    Serial.printf("[WiFi] Attempt %d/40 status: %s (%d)\n",
                  attempts + 1, wifiStatusText(status), status);
    attempts++;
  }

  wl_status_t finalStatus = WiFi.status();
  if (finalStatus == WL_CONNECTED) {
    Serial.printf("[WiFi] Connected. IP: %s | RSSI: %d dBm\n",
                  WiFi.localIP().toString().c_str(), WiFi.RSSI());
  } else {
    Serial.printf("[WiFi] Connection failed. Final status: %s (%d)\n",
                  wifiStatusText(finalStatus), finalStatus);
    Serial.println("[WiFi] Will retry using WIFI_RETRY_MS interval");
#if WIFI_USE_ENTERPRISE
    Serial.println("[WiFi] Enterprise tip: verify identity/username/password and EAP settings");
#else
    Serial.println("[WiFi] PSK tip: verify SSID/password and ensure AP is 2.4 GHz");
#endif
  }
}

// ── Setup & loop ─────────────────────────────────────────────────────────────
void setup() {
  Serial.begin(115200);
  delay(50);
  Serial.println("\n[BOOT] setup() start");
  Serial.println("=== Smart Irrigation ESP32 ===");
  Serial.println("[BOOT] Moisture: GPIO 34 | Relay: GPIO 26 via level shifter");
  Serial.printf("[BOOT] Relay active-low: %s\n", RELAY_ACTIVE_LOW ? "true" : "false");
  Serial.printf("[BOOT] Free heap: %u bytes\n", ESP.getFreeHeap());

  pinMode(PIN_MOISTURE_AO, INPUT);
  pinMode(PIN_RELAY, OUTPUT);
  // Relay OFF at boot (active LOW → HIGH = off)
  digitalWrite(PIN_RELAY, RELAY_ACTIVE_LOW ? HIGH : LOW);
  state.pumpOn = false;
  Serial.println("[BOOT] Pin initialization complete; relay forced OFF");

  analogReadResolution(12);
  analogSetAttenuation(ADC_11db);
  Serial.println("[BOOT] ADC configured: 12-bit, 11dB attenuation");

  Serial.println("[BOOT] Starting Wi-Fi connection");
  connectWiFi();
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    connectWiFi();
    delay(WIFI_RETRY_MS);
    return;
  }

  unsigned long now = millis();

  int raw = readMoistureRaw();
  int pct = rawToPercent(raw);
  applyAutoLogic(pct);

  if (now - lastCommandPoll >= COMMAND_POLL_MS) {
    lastCommandPoll = now;
    pollCommands();
  }

  if (now - lastTelemetry >= TELEMETRY_INTERVAL_MS) {
    lastTelemetry = now;
    bool ok = postTelemetry(raw, pct);
    Serial.printf("Moisture: %d%% (raw %d) | Pump: %s | Mode: %s | TX: %s\n",
                  pct, raw,
                  state.pumpOn ? "ON" : "OFF",
                  state.mode == MODE_AUTO ? "auto" : "manual",
                  ok ? "OK" : "FAIL");
  }

  delay(10);
}
