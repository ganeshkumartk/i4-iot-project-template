import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const dataDir = path.join(repoRoot, "data");

function parseArgs(argv) {
  const out = { input: null };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--input" && argv[i + 1]) {
      out.input = argv[++i];
    }
  }
  return out;
}

function latestTelemetryCsv(dir) {
  if (!fs.existsSync(dir)) return null;
  const files = fs
    .readdirSync(dir)
    .filter((name) => /^telemetry-.*\.csv$/.test(name))
    .map((name) => ({
      name,
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
  if (lines.length < 2) return [];
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
    const dryThreshold = toNum(raw.dryThreshold);
    const wetThreshold = toNum(raw.wetThreshold);

    if (moistureRaw == null || moisturePercent == null) continue;

    rows.push({
      timestamp: raw.timestamp,
      timestampMs,
      deviceId: raw.deviceId ?? "",
      moistureRaw,
      moisturePercent,
      pumpOn: toBool(raw.pumpOn),
      mode: raw.mode ?? "",
      rssi: toNum(raw.rssi),
      uptimeMs: toNum(raw.uptimeMs),
      dryThreshold: dryThreshold ?? 35,
      wetThreshold: wetThreshold ?? 65,
    });
  }

  rows.sort((a, b) => a.timestampMs - b.timestampMs);

  // Feature engineering: rolling mean and per-sample delta.
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
  return {
    train: rows.slice(0, splitIdx),
    test: rows.slice(splitIdx),
  };
}

function trainRawThresholdModel(trainRows) {
  if (!trainRows.length) return null;

  const candidates = [...new Set(trainRows.map((r) => r.moistureRaw))].sort((a, b) => a - b);
  let best = {
    threshold: candidates[0],
    score: -1,
  };

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

    if (f1 > best.score) {
      best = { threshold, score: f1 };
    }
  }

  return best;
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
    accuracy,
    precision,
    recall,
    f1,
  };
}

function computePumpEfficiency(rows) {
  const events = [];
  for (let i = 1; i < rows.length; i++) {
    const prev = rows[i - 1];
    const cur = rows[i];

    if (!prev.pumpOn && cur.pumpOn) {
      const startTime = cur.timestampMs;
      const wetThreshold = cur.wetThreshold;
      let reachedAt = null;

      for (let j = i; j < rows.length; j++) {
        if (rows[j].moisturePercent >= wetThreshold) {
          reachedAt = rows[j].timestampMs;
          break;
        }
      }

      events.push({
        startTimestamp: cur.timestamp,
        wetThreshold,
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

function roundMetrics(metrics) {
  return {
    ...metrics,
    accuracy: Number(metrics.accuracy.toFixed(3)),
    precision: Number(metrics.precision.toFixed(3)),
    recall: Number(metrics.recall.toFixed(3)),
    f1: Number(metrics.f1.toFixed(3)),
  };
}

function main() {
  const args = parseArgs(process.argv);
  const inputPath = args.input
    ? path.resolve(process.cwd(), args.input)
    : latestTelemetryCsv(dataDir);

  if (!inputPath || !fs.existsSync(inputPath)) {
    console.error(
      "No telemetry CSV found. Provide one with --input <path> or export data first via /api/data/export.csv"
    );
    process.exit(1);
  }

  const csv = fs.readFileSync(inputPath, "utf8");
  const rows = parseCsv(csv);

  if (rows.length < 10) {
    console.error(`Need at least 10 valid telemetry rows for analysis. Found ${rows.length}.`);
    process.exit(1);
  }

  const { train, test } = splitChronological(rows, 0.8);
  const model = trainRawThresholdModel(train);

  if (!model) {
    console.error("Could not train model from input data.");
    process.exit(1);
  }

  const trainMetrics = roundMetrics(evaluate(train, model.threshold));
  const testMetrics = roundMetrics(evaluate(test, model.threshold));
  const pumpEfficiency = computePumpEfficiency(rows);

  const summary = {
    inputFile: inputPath,
    totalSamples: rows.length,
    split: {
      trainSamples: train.length,
      testSamples: test.length,
      strategy: "chronological-80-20",
    },
    preprocessing: {
      droppedInvalidRows: csv.split(/\r?\n/).filter(Boolean).length - 1 - rows.length,
      engineeredFeatures: ["moistureRollingMean3", "moistureDelta"],
      label: "isDry = moisturePercent < dryThreshold",
    },
    model: {
      type: "single-feature-threshold-classifier",
      feature: "moistureRaw",
      learnedThreshold: model.threshold,
      selectionMetric: "train_f1",
      trainMetrics,
      testMetrics,
    },
    pumpEfficiency,
  };

  console.log(JSON.stringify(summary, null, 2));
}

main();
