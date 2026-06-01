import "dotenv/config";
import express from "express";
import { createServer } from "http";
import { WebSocketServer } from "ws";
import path from "path";
import { fileURLToPath } from "url";
import {
  createTelemetryLogger,
  readTelemetryCsv,
  readTelemetryJsonl,
} from "./telemetry-log.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "public");
const docsDir = path.resolve(__dirname, "..", "docs");
const dataDir = path.resolve(__dirname, "..", "data");

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || "0.0.0.0";
const API_KEY = process.env.DEVICE_API_KEY || "";
const DATA_LOGGING = process.env.DATA_LOGGING !== "false";
const DATA_SESSION_ID =
  process.env.DATA_SESSION_ID ||
  new Date().toISOString().slice(0, 10).replace(/-/g, "");

const DEFAULT_DRY = Number(process.env.DEFAULT_DRY_THRESHOLD) || 35;
const DEFAULT_WET = Number(process.env.DEFAULT_WET_THRESHOLD) || 65;

const logger = createTelemetryLogger({
  dataDir,
  sessionId: DATA_SESSION_ID,
  enabled: DATA_LOGGING,
});

/** @type {import('express').Express} */
const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.json());
app.use(express.static(publicDir));
app.use("/docs", express.static(docsDir));

/** Shared system state */
const state = {
  deviceId: null,
  moistureRaw: 0,
  moisturePercent: 0,
  pumpOn: false,
  mode: "auto",
  dryThreshold: DEFAULT_DRY,
  wetThreshold: DEFAULT_WET,
  rssi: null,
  uptimeMs: 0,
  lastSeen: null,
  connected: false,
};

/** Pending commands for ESP32 to pick up on next poll */
const pendingCommands = {};

function broadcast() {
  const payload = JSON.stringify({ type: "state", data: { ...state } });
  for (const client of wss.clients) {
    if (client.readyState === 1) client.send(payload);
  }
}

function checkApiKey(req, res, next) {
  if (!API_KEY) return next();
  const key = req.headers["x-device-key"];
  if (key !== API_KEY) {
    return res.status(401).json({ error: "Invalid device key" });
  }
  next();
}

function mergeControl(body) {
  if (body.mode === "auto" || body.mode === "manual") {
    state.mode = body.mode;
    pendingCommands.mode = body.mode;
  }
  if (typeof body.dryThreshold === "number") {
    state.dryThreshold = clamp(body.dryThreshold, 0, 100);
    pendingCommands.dryThreshold = state.dryThreshold;
  }
  if (typeof body.wetThreshold === "number") {
    state.wetThreshold = clamp(body.wetThreshold, 0, 100);
    pendingCommands.wetThreshold = state.wetThreshold;
  }
  if (typeof body.pumpOn === "boolean") {
    state.pumpOn = body.pumpOn;
    pendingCommands.pumpOn = body.pumpOn;
  }
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

// ── REST API ─────────────────────────────────────────────────────────────────

app.get("/api/state", (_req, res) => {
  res.json({ ...state });
});

app.post("/api/telemetry", checkApiKey, (req, res) => {
  const {
    deviceId,
    moistureRaw,
    moisturePercent,
    pumpOn,
    mode,
    rssi,
    uptimeMs,
  } = req.body;

  if (deviceId) state.deviceId = deviceId;
  if (typeof moistureRaw === "number") state.moistureRaw = moistureRaw;
  if (typeof moisturePercent === "number") state.moisturePercent = moisturePercent;
  if (typeof pumpOn === "boolean") state.pumpOn = pumpOn;
  if (mode === "auto" || mode === "manual") state.mode = mode;
  if (typeof rssi === "number") state.rssi = rssi;
  if (typeof uptimeMs === "number") state.uptimeMs = uptimeMs;

  state.lastSeen = new Date().toISOString();
  state.connected = true;

  logger.append({
    timestamp: state.lastSeen,
    deviceId: state.deviceId,
    moistureRaw: state.moistureRaw,
    moisturePercent: state.moisturePercent,
    pumpOn: state.pumpOn,
    mode: state.mode,
    rssi: state.rssi,
    uptimeMs: state.uptimeMs,
    dryThreshold: state.dryThreshold,
    wetThreshold: state.wetThreshold,
  });

  broadcast();
  res.json({ ok: true });
});

app.get("/api/commands", checkApiKey, (req, res) => {
  const deviceId = req.query.deviceId;
  if (deviceId) state.deviceId = deviceId;

  const commands = { ...pendingCommands };
  for (const key of Object.keys(pendingCommands)) {
    delete pendingCommands[key];
  }

  res.json(commands);
});

app.post("/api/control", (req, res) => {
  mergeControl(req.body);
  broadcast();
  res.json({ ok: true, state: { ...state } });
});

// ── Data export (analytics / ML follow-up session) ───────────────────────────

app.get("/api/data/info", (_req, res) => {
  const paths = logger.getPaths();
  res.json({
    loggingEnabled: DATA_LOGGING,
    sessionId: paths.sessionId,
    csvFile: path.basename(paths.csvPath),
    jsonlFile: path.basename(paths.jsonlPath),
    exportCsv: "/api/data/export.csv",
    exportJsonl: "/api/data/export.jsonl",
    history: "/api/data/history",
  });
});

app.get("/api/data/history", (_req, res) => {
  const paths = logger.getPaths();
  res.json(readTelemetryJsonl(paths.jsonlPath));
});

app.get("/api/data/export.csv", (_req, res) => {
  const paths = logger.getPaths();
  res.setHeader("Content-Type", "text/csv");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="telemetry-${paths.sessionId}.csv"`
  );
  res.send(readTelemetryCsv(paths.csvPath));
});

app.get("/api/data/export.jsonl", (_req, res) => {
  const paths = logger.getPaths();
  if (!readTelemetryJsonl(paths.jsonlPath).length) {
    return res.status(404).json({ error: "No data logged yet" });
  }
  res.setHeader("Content-Type", "application/x-ndjson");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="telemetry-${paths.sessionId}.jsonl"`
  );
  res.sendFile(paths.jsonlPath);
});

// Mark device offline if no telemetry for 15s
setInterval(() => {
  if (!state.lastSeen) return;
  const age = Date.now() - new Date(state.lastSeen).getTime();
  const wasConnected = state.connected;
  state.connected = age < 15000;
  if (wasConnected !== state.connected) broadcast();
}, 5000);

wss.on("connection", (ws) => {
  ws.send(JSON.stringify({ type: "state", data: { ...state } }));
});

server.listen(PORT, HOST, () => {
  const paths = logger.getPaths();
  console.log(`Smart Irrigation server → http://${HOST === "0.0.0.0" ? "localhost" : HOST}:${PORT}`);
  console.log(`Wiring card → http://localhost:${PORT}/docs/wiring-card.html`);
  console.log(`ESP32 telemetry POST → http://<your-lan-ip>:${PORT}/api/telemetry`);
  if (DATA_LOGGING) {
    console.log(`Data logging ON → data/telemetry-${paths.sessionId}.csv`);
    console.log(`Export CSV → http://localhost:${PORT}/api/data/export.csv`);
  }
});
