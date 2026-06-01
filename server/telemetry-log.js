import fs from "fs";
import path from "path";

const CSV_HEADER =
  "timestamp,deviceId,moistureRaw,moisturePercent,pumpOn,mode,rssi,uptimeMs,dryThreshold,wetThreshold\n";

export function createTelemetryLogger(options) {
  const { dataDir, sessionId, enabled } = options;
  const csvPath = path.join(dataDir, `telemetry-${sessionId}.csv`);
  const jsonlPath = path.join(dataDir, `telemetry-${sessionId}.jsonl`);

  if (enabled) {
    fs.mkdirSync(dataDir, { recursive: true });
    if (!fs.existsSync(csvPath)) {
      fs.writeFileSync(csvPath, CSV_HEADER);
    }
  }

  function append(record) {
    if (!enabled) return;

    const row = {
      timestamp: record.timestamp ?? new Date().toISOString(),
      deviceId: record.deviceId ?? "",
      moistureRaw: record.moistureRaw ?? "",
      moisturePercent: record.moisturePercent ?? "",
      pumpOn: record.pumpOn ?? false,
      mode: record.mode ?? "",
      rssi: record.rssi ?? "",
      uptimeMs: record.uptimeMs ?? "",
      dryThreshold: record.dryThreshold ?? "",
      wetThreshold: record.wetThreshold ?? "",
    };

    fs.appendFileSync(jsonlPath, JSON.stringify(row) + "\n");

    const csvLine = [
      row.timestamp,
      row.deviceId,
      row.moistureRaw,
      row.moisturePercent,
      row.pumpOn,
      row.mode,
      row.rssi,
      row.uptimeMs,
      row.dryThreshold,
      row.wetThreshold,
    ].join(",") + "\n";

    fs.appendFileSync(csvPath, csvLine);
  }

  return {
    csvPath,
    jsonlPath,
    append,
    getPaths: () => ({ csvPath, jsonlPath, sessionId }),
  };
}

export function readTelemetryCsv(csvPath) {
  if (!fs.existsSync(csvPath)) return CSV_HEADER;
  return fs.readFileSync(csvPath, "utf8");
}

export function readTelemetryJsonl(jsonlPath) {
  if (!fs.existsSync(jsonlPath)) return [];
  return fs
    .readFileSync(jsonlPath, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}
