import fs from "fs";
import path from "path";

export function latestTelemetryCsv(dir) {
  if (!fs.existsSync(dir)) return null;
  const files = fs
    .readdirSync(dir)
    .filter((name) => /^telemetry-.*\.csv$/.test(name))
    .map((name) => ({
      fullPath: path.join(dir, name),
      mtimeMs: fs.statSync(path.join(dir, name)).mtimeMs,
    }))
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
  return files[0]?.fullPath ?? null;
}

function toBool(v) {
  if (typeof v === "boolean") return v;
  if (typeof v !== "string") return false;
  return v.trim().toLowerCase() === "true";
}

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function parseCsv(csvText) {
  const lines = csvText.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return { rows: [], droppedInvalidRows: 0 };

  const headers = lines[0].split(",").map((h) => h.trim());
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",");
    if (cols.length !== headers.length) continue;

    const raw = Object.fromEntries(headers.map((h, idx) => [h, cols[idx]]));
    const timestampMs = Date.parse(raw.timestamp);
    if (!Number.isFinite(timestampMs)) continue;

    const moistureRaw = toNum(raw.moistureRaw);
    const moisturePercent = toNum(raw.moisturePercent);
    if (moistureRaw == null || moisturePercent == null) continue;

    rows.push({
      timestamp: raw.timestamp,
      timestampMs,
      deviceId: raw.deviceId ?? "",
      moistureRaw,
      moisturePercent,
      pumpOn: toBool(raw.pumpOn),
      mode: raw.mode ?? "auto",
      rssi: toNum(raw.rssi),
      uptimeMs: toNum(raw.uptimeMs),
      dryThreshold: toNum(raw.dryThreshold) ?? 35,
      wetThreshold: toNum(raw.wetThreshold) ?? 65,
    });
  }

  rows.sort((a, b) => a.timestampMs - b.timestampMs);
  const droppedInvalidRows = lines.length - 1 - rows.length;
  return { rows, droppedInvalidRows };
}

function createRng(seed = 42) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function generateSyntheticRows(options = {}) {
  const samples = options.samples ?? 120;
  const intervalMs = options.intervalMs ?? 60_000;
  const startMs = Date.now() - (samples - 1) * intervalMs;
  const random = createRng(options.seed ?? 42);

  let moisturePercent = 58;
  let pumpOn = false;
  const dryThreshold = 35;
  const wetThreshold = 65;
  const rows = [];

  for (let i = 0; i < samples; i++) {
    if (!pumpOn && moisturePercent <= dryThreshold) pumpOn = true;
    if (pumpOn && moisturePercent >= wetThreshold) pumpOn = false;

    const drift = pumpOn ? 2.6 : -1.1;
    const noise = (random() - 0.5) * 2.4;
    moisturePercent = Math.max(8, Math.min(90, moisturePercent + drift + noise));

    const moistureRawIdeal = Math.round(4095 * (1 - moisturePercent / 100));
    const rawNoise = Math.round((random() - 0.5) * 120);

    const timestampMs = startMs + i * intervalMs;

    rows.push({
      timestamp: new Date(timestampMs).toISOString(),
      timestampMs,
      deviceId: "synthetic-irrigation-lab",
      moistureRaw: Math.max(0, Math.min(4095, moistureRawIdeal + rawNoise)),
      moisturePercent: Number(moisturePercent.toFixed(2)),
      pumpOn,
      mode: "auto",
      rssi: -58,
      uptimeMs: i * intervalMs,
      dryThreshold,
      wetThreshold,
    });
  }

  return rows;
}

function addFeatures(rows) {
  for (let i = 0; i < rows.length; i++) {
    const start = Math.max(0, i - 2);
    const window = rows.slice(start, i + 1);
    rows[i].moistureRollingMean3 =
      window.reduce((sum, r) => sum + r.moisturePercent, 0) / window.length;
    rows[i].moistureDelta = i === 0 ? 0 : rows[i].moisturePercent - rows[i - 1].moisturePercent;
    rows[i].isDry = rows[i].moisturePercent < rows[i].dryThreshold;
  }
  return rows;
}

function splitChronological(rows, trainRatio = 0.8) {
  if (rows.length < 2) return { train: rows, test: [] };
  const splitIdx = Math.max(1, Math.min(rows.length - 1, Math.floor(rows.length * trainRatio)));
  return { train: rows.slice(0, splitIdx), test: rows.slice(splitIdx) };
}

function trainRawThresholdModel(trainRows) {
  if (!trainRows.length) return null;

  const candidates = [...new Set(trainRows.map((r) => r.moistureRaw))].sort((a, b) => a - b);
  const thresholdCurve = [];

  let best = { threshold: candidates[0], score: -1 };

  for (const threshold of candidates) {
    let tp = 0;
    let fp = 0;
    let fn = 0;

    for (const r of trainRows) {
      const predictedDry = r.moistureRaw >= threshold;
      if (predictedDry && r.isDry) tp++;
      else if (predictedDry && !r.isDry) fp++;
      else if (!predictedDry && r.isDry) fn++;
    }

    const precision = tp + fp === 0 ? 0 : tp / (tp + fp);
    const recall = tp + fn === 0 ? 0 : tp / (tp + fn);
    const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);

    thresholdCurve.push({
      threshold,
      precision: Number(precision.toFixed(3)),
      recall: Number(recall.toFixed(3)),
      f1: Number(f1.toFixed(3)),
    });

    if (f1 > best.score) best = { threshold, score: f1 };
  }

  return {
    threshold: best.threshold,
    selectionMetric: "train_f1",
    thresholdCurve,
  };
}

function evaluate(rows, threshold) {
  let tp = 0;
  let tn = 0;
  let fp = 0;
  let fn = 0;

  for (const r of rows) {
    const predictedDry = r.moistureRaw >= threshold;
    if (predictedDry && r.isDry) tp++;
    else if (!predictedDry && !r.isDry) tn++;
    else if (predictedDry && !r.isDry) fp++;
    else fn++;
  }

  const total = rows.length;
  const accuracy = total === 0 ? 0 : (tp + tn) / total;
  const precision = tp + fp === 0 ? 0 : tp / (tp + fp);
  const recall = tp + fn === 0 ? 0 : tp / (tp + fn);
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);

  return {
    samples: total,
    tp,
    tn,
    fp,
    fn,
    accuracy: Number(accuracy.toFixed(3)),
    precision: Number(precision.toFixed(3)),
    recall: Number(recall.toFixed(3)),
    f1: Number(f1.toFixed(3)),
  };
}

function computePumpEfficiency(rows) {
  const events = [];

  for (let i = 1; i < rows.length; i++) {
    const prev = rows[i - 1];
    const cur = rows[i];

    if (!prev.pumpOn && cur.pumpOn) {
      const startTime = cur.timestampMs;
      let reachedAt = null;

      for (let j = i; j < rows.length; j++) {
        if (rows[j].moisturePercent >= cur.wetThreshold) {
          reachedAt = rows[j].timestampMs;
          break;
        }
      }

      events.push({
        startTimestamp: cur.timestamp,
        wetThreshold: cur.wetThreshold,
        reachedWet: reachedAt != null,
        secondsToWet: reachedAt == null ? null : Math.round((reachedAt - startTime) / 1000),
      });
    }
  }

  const completed = events.filter((e) => e.reachedWet && e.secondsToWet != null);
  const averageSecondsToWet =
    completed.length === 0
      ? null
      : Math.round(completed.reduce((sum, e) => sum + e.secondsToWet, 0) / completed.length);

  return {
    pumpOnEvents: events.length,
    completedCycles: completed.length,
    averageSecondsToWet,
    events,
  };
}

function downsample(values, maxPoints = 180) {
  if (values.length <= maxPoints) return values;
  const step = values.length / maxPoints;
  const out = [];
  for (let i = 0; i < maxPoints; i++) {
    out.push(values[Math.floor(i * step)]);
  }
  const last = values[values.length - 1];
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}

export function analyzeTelemetryDataset(options = {}) {
  const {
    dataDir,
    inputPath,
    source = "auto", // auto | csv | synthetic
    minRows = 10,
  } = options;

  let rows = [];
  let droppedInvalidRows = 0;
  let sourceInfo = { type: "csv", inputFile: null, reason: null };

  if (source === "synthetic") {
    rows = generateSyntheticRows();
    sourceInfo = {
      type: "synthetic",
      inputFile: null,
      reason: "Synthetic data requested",
    };
  } else {
    const resolvedPath = inputPath
      ? path.resolve(inputPath)
      : dataDir
      ? latestTelemetryCsv(dataDir)
      : null;

    if (resolvedPath && fs.existsSync(resolvedPath)) {
      const csv = fs.readFileSync(resolvedPath, "utf8");
      const parsed = parseCsv(csv);
      rows = parsed.rows;
      droppedInvalidRows = parsed.droppedInvalidRows;
      sourceInfo = {
        type: "csv",
        inputFile: resolvedPath,
        reason: null,
      };
    }

    if (rows.length < minRows && source !== "csv") {
      rows = generateSyntheticRows();
      droppedInvalidRows = 0;
      sourceInfo = {
        type: "synthetic",
        inputFile: null,
        reason: "No telemetry CSV with enough rows found; generated synthetic lab dataset",
      };
    }

    if (rows.length < minRows && source === "csv") {
      throw new Error(`Need at least ${minRows} valid telemetry rows from CSV. Found ${rows.length}.`);
    }
  }

  rows = addFeatures(rows);

  const { train, test } = splitChronological(rows, 0.8);
  const model = trainRawThresholdModel(train);
  if (!model) throw new Error("Could not train model from input data");

  const trainMetrics = evaluate(train, model.threshold);
  const testMetrics = evaluate(test, model.threshold);

  const timeseries = downsample(
    rows.map((r) => ({
      timestamp: r.timestamp,
      moisturePercent: Number(r.moisturePercent.toFixed(2)),
      moistureRaw: r.moistureRaw,
      pumpOn: r.pumpOn,
      dryThreshold: r.dryThreshold,
      wetThreshold: r.wetThreshold,
      isDry: r.isDry,
    })),
    200
  );

  const trainScatter = downsample(
    train.map((r) => ({ raw: r.moistureRaw, moisturePercent: Number(r.moisturePercent.toFixed(2)), isDry: r.isDry })),
    240
  );

  return {
    source: sourceInfo,
    totalSamples: rows.length,
    split: {
      trainSamples: train.length,
      testSamples: test.length,
      strategy: "chronological-80-20",
    },
    preprocessing: {
      droppedInvalidRows,
      engineeredFeatures: ["moistureRollingMean3", "moistureDelta"],
      label: "isDry = moisturePercent < dryThreshold",
    },
    model: {
      type: "single-feature-threshold-classifier",
      feature: "moistureRaw",
      learnedThreshold: model.threshold,
      selectionMetric: model.selectionMetric,
      trainMetrics,
      testMetrics,
      thresholdCurve: downsample(model.thresholdCurve, 250),
    },
    pumpEfficiency: computePumpEfficiency(rows),
    visualization: {
      timeseries,
      trainScatter,
    },
  };
}
