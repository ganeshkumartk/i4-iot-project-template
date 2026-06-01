const $ = (id) => document.getElementById(id);

const els = {
  connectionStatus: $("connectionStatus"),
  moistureValue: $("moistureValue"),
  moistureRaw: $("moistureRaw"),
  moistureLabel: $("moistureLabel"),
  moistureArc: $("moistureArc"),
  moistureBarFill: $("moistureBarFill"),
  dryMarker: $("dryMarker"),
  wetMarker: $("wetMarker"),
  pumpIcon: $("pumpIcon"),
  pumpLabel: $("pumpLabel"),
  manualControls: $("manualControls"),
  btnAuto: $("btnAuto"),
  btnManual: $("btnManual"),
  btnPumpOn: $("btnPumpOn"),
  btnPumpOff: $("btnPumpOff"),
  dryThreshold: $("dryThreshold"),
  wetThreshold: $("wetThreshold"),
  dryThresholdOut: $("dryThresholdOut"),
  wetThresholdOut: $("wetThresholdOut"),
  btnApplyThresholds: $("btnApplyThresholds"),
  deviceId: $("deviceId"),
  rssi: $("rssi"),
  uptime: $("uptime"),
  lastSeen: $("lastSeen"),
  modeDisplay: $("modeDisplay"),
};

const CIRCUMFERENCE = 327;
let ws;
let reconnectTimer;

function connect() {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  ws = new WebSocket(`${protocol}//${location.host}`);

  ws.onopen = () => {
    console.log("WebSocket connected");
  };

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.type === "state") updateUI(msg.data);
  };

  ws.onclose = () => {
    reconnectTimer = setTimeout(connect, 3000);
  };
}

async function sendControl(body) {
  await fetch("/api/control", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function moistureStatus(pct) {
  if (pct < 30) return { label: "Very dry", color: "#dc2626" };
  if (pct < 50) return { label: "Dry", color: "#ca8a04" };
  if (pct < 70) return { label: "Moist", color: "#16a34a" };
  return { label: "Wet", color: "#0f7a35" };
}

function formatUptime(ms) {
  if (!ms) return "—";
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

function updateUI(state) {
  const pct = state.moisturePercent ?? 0;
  const status = moistureStatus(pct);

  els.moistureValue.textContent = state.connected ? pct : "—";
  els.moistureRaw.textContent = state.moistureRaw ?? "—";
  els.moistureLabel.textContent = state.connected ? status.label : "—";

  const offset = CIRCUMFERENCE - (pct / 100) * CIRCUMFERENCE;
  els.moistureArc.style.strokeDashoffset = offset;
  els.moistureArc.style.stroke = status.color;
  els.moistureBarFill.style.width = `${pct}%`;

  const dry = state.dryThreshold ?? 35;
  const wet = state.wetThreshold ?? 65;
  els.dryMarker.style.left = `${dry}%`;
  els.wetMarker.style.left = `${wet}%`;

  els.dryThreshold.value = dry;
  els.wetThreshold.value = wet;
  els.dryThresholdOut.textContent = dry;
  els.wetThresholdOut.textContent = wet;

  const pumpOn = state.pumpOn;
  els.pumpIcon.classList.toggle("pump-icon--on", pumpOn);
  els.pumpLabel.textContent = pumpOn ? "Pump ON" : "Pump OFF";

  const isManual = state.mode === "manual";
  els.btnAuto.classList.toggle("mode-btn--active", !isManual);
  els.btnManual.classList.toggle("mode-btn--active", isManual);
  els.manualControls.hidden = !isManual;

  els.deviceId.textContent = state.deviceId ?? "—";
  els.rssi.textContent = state.rssi != null ? `${state.rssi} dBm` : "—";
  els.uptime.textContent = formatUptime(state.uptimeMs);
  els.lastSeen.textContent = state.lastSeen
    ? new Date(state.lastSeen).toLocaleTimeString()
    : "—";
  els.modeDisplay.textContent = state.mode ?? "—";

  const dot = els.connectionStatus.querySelector(".dot");
  const label = els.connectionStatus.querySelector("span:last-child");
  dot.className = `dot ${state.connected ? "dot--online" : "dot--offline"}`;
  label.textContent = state.connected ? "Device online" : "Device offline";
}

els.btnAuto.addEventListener("click", () => sendControl({ mode: "auto" }));
els.btnManual.addEventListener("click", () => sendControl({ mode: "manual" }));
els.btnPumpOn.addEventListener("click", () => sendControl({ mode: "manual", pumpOn: true }));
els.btnPumpOff.addEventListener("click", () => sendControl({ mode: "manual", pumpOn: false }));

els.dryThreshold.addEventListener("input", (e) => {
  els.dryThresholdOut.textContent = e.target.value;
});
els.wetThreshold.addEventListener("input", (e) => {
  els.wetThresholdOut.textContent = e.target.value;
});

els.btnApplyThresholds.addEventListener("click", () => {
  sendControl({
    dryThreshold: Number(els.dryThreshold.value),
    wetThreshold: Number(els.wetThreshold.value),
  });
});

connect();

fetch("/api/state")
  .then((r) => r.json())
  .then(updateUI)
  .catch(console.error);
