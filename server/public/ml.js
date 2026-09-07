const $ = (id) => document.getElementById(id);

const els = {
  summary: $("summary"),
  trainMetrics: $("trainMetrics"),
  testMetrics: $("testMetrics"),
  pumpEfficiency: $("pumpEfficiency"),
  btnRefresh: $("btnRefresh"),
  btnSynthetic: $("btnSynthetic"),
};

let timelineChart;
let curveChart;
let scatterChart;

function metricCard(name, value) {
  return `<div class="metric"><small>${name}</small><strong>${value}</strong></div>`;
}

function kvCard(name, value) {
  return `<div class="kv"><small>${name}</small><strong>${value}</strong></div>`;
}

function renderSummary(data) {
  const sourceText =
    data.source.type === "synthetic"
      ? `Synthetic dataset (${data.source.reason || "lab fallback"})`
      : `CSV dataset (${data.source.inputFile || "latest telemetry"})`;

  els.summary.innerHTML = [
    kvCard("Data source", sourceText),
    kvCard("Total samples", data.totalSamples),
    kvCard("Train / Test", `${data.split.trainSamples} / ${data.split.testSamples}`),
    kvCard("Model", `${data.model.type} @ threshold ${data.model.learnedThreshold}`),
    kvCard("Label", data.preprocessing.label),
    kvCard("Dropped rows", data.preprocessing.droppedInvalidRows),
  ].join("");

  els.trainMetrics.innerHTML = [
    metricCard("Accuracy", data.model.trainMetrics.accuracy),
    metricCard("Precision", data.model.trainMetrics.precision),
    metricCard("Recall", data.model.trainMetrics.recall),
    metricCard("F1", data.model.trainMetrics.f1),
    metricCard("TP/TN", `${data.model.trainMetrics.tp}/${data.model.trainMetrics.tn}`),
    metricCard("FP/FN", `${data.model.trainMetrics.fp}/${data.model.trainMetrics.fn}`),
  ].join("");

  els.testMetrics.innerHTML = [
    metricCard("Accuracy", data.model.testMetrics.accuracy),
    metricCard("Precision", data.model.testMetrics.precision),
    metricCard("Recall", data.model.testMetrics.recall),
    metricCard("F1", data.model.testMetrics.f1),
    metricCard("TP/TN", `${data.model.testMetrics.tp}/${data.model.testMetrics.tn}`),
    metricCard("FP/FN", `${data.model.testMetrics.fp}/${data.model.testMetrics.fn}`),
  ].join("");

  els.pumpEfficiency.innerHTML = [
    kvCard("Pump ON events", data.pumpEfficiency.pumpOnEvents),
    kvCard("Completed cycles", data.pumpEfficiency.completedCycles),
    kvCard(
      "Avg seconds to wet",
      data.pumpEfficiency.averageSecondsToWet == null ? "—" : data.pumpEfficiency.averageSecondsToWet
    ),
  ].join("");
}

function renderTimeline(data) {
  const labels = data.visualization.timeseries.map((p) =>
    new Date(p.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  );
  const moisture = data.visualization.timeseries.map((p) => p.moisturePercent);
  const dry = data.visualization.timeseries.map((p) => p.dryThreshold);
  const wet = data.visualization.timeseries.map((p) => p.wetThreshold);
  const pump = data.visualization.timeseries.map((p) => (p.pumpOn ? 100 : 0));

  timelineChart?.destroy();
  timelineChart = new Chart($("timelineChart"), {
    type: "line",
    data: {
      labels,
      datasets: [
        { label: "Moisture %", data: moisture, borderColor: "#166534", tension: 0.2, yAxisID: "y" },
        { label: "Dry threshold", data: dry, borderColor: "#ca8a04", borderDash: [6, 4], yAxisID: "y" },
        { label: "Wet threshold", data: wet, borderColor: "#0284c7", borderDash: [6, 4], yAxisID: "y" },
        { label: "Pump ON", data: pump, borderColor: "#dc2626", stepped: true, yAxisID: "y2" },
      ],
    },
    options: {
      responsive: true,
      plugins: { legend: { position: "bottom" } },
      scales: {
        y: { min: 0, max: 100, title: { display: true, text: "Moisture %" } },
        y2: { min: 0, max: 100, position: "right", grid: { drawOnChartArea: false }, title: { display: true, text: "Pump" } },
      },
    },
  });
}

function renderCurve(data) {
  const points = data.model.thresholdCurve;

  curveChart?.destroy();
  curveChart = new Chart($("curveChart"), {
    type: "line",
    data: {
      labels: points.map((p) => p.threshold),
      datasets: [{ label: "Train F1", data: points.map((p) => p.f1), borderColor: "#166534", pointRadius: 0 }],
    },
    options: {
      responsive: true,
      plugins: { legend: { position: "bottom" } },
      scales: {
        x: { title: { display: true, text: "Raw moisture threshold" } },
        y: { min: 0, max: 1, title: { display: true, text: "F1" } },
      },
    },
  });
}

function renderScatter(data) {
  const trainDry = data.visualization.trainScatter.filter((p) => p.isDry);
  const trainWet = data.visualization.trainScatter.filter((p) => !p.isDry);

  scatterChart?.destroy();
  scatterChart = new Chart($("scatterChart"), {
    type: "scatter",
    data: {
      datasets: [
        {
          label: "Dry samples",
          data: trainDry.map((p) => ({ x: p.raw, y: p.moisturePercent })),
          backgroundColor: "#dc2626",
        },
        {
          label: "Wet/normal samples",
          data: trainWet.map((p) => ({ x: p.raw, y: p.moisturePercent })),
          backgroundColor: "#166534",
        },
      ],
    },
    options: {
      responsive: true,
      plugins: { legend: { position: "bottom" } },
      scales: {
        x: { title: { display: true, text: "Raw moisture ADC" } },
        y: { min: 0, max: 100, title: { display: true, text: "Moisture %" } },
      },
    },
  });
}

async function loadAnalysis(source = "auto") {
  const url = source === "auto" ? "/api/ml/analysis" : `/api/ml/analysis?source=${source}`;
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed (${res.status})`);
  }
  return res.json();
}

async function refresh(source = "auto") {
  try {
    const data = await loadAnalysis(source);
    renderSummary(data);
    renderTimeline(data);
    renderCurve(data);
    renderScatter(data);
  } catch (error) {
    els.summary.innerHTML = `<p class="status status--danger">${error.message}</p>`;
  }
}

els.btnRefresh.addEventListener("click", () => refresh("auto"));
els.btnSynthetic.addEventListener("click", () => refresh("synthetic"));

refresh("auto");
