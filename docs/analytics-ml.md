# Data Analysis and Machine Learning Workflow

This project logs smart-irrigation telemetry so you can run post-workshop data analysis and a simple train/evaluate ML pipeline.

You can use either:

- **CLI** (`npm run analyze:ml`)
- **Web UI** (`http://localhost:3000/ml.html`)

## 1) Collect telemetry data

Export from the running server:

- `GET /api/data/export.csv`
- `GET /api/data/export.jsonl`
- `GET /api/data/history`
- `GET /api/data/info`

Or use files already on disk:

- `data/telemetry-<session-id>.csv`
- `data/telemetry-<session-id>.jsonl`

## 2) Input schema

CSV fields used by analysis:

| Column | Type | Meaning |
|---|---|---|
| `timestamp` | ISO-8601 string | Server receive time for telemetry row |
| `deviceId` | string | ESP32 identifier |
| `moistureRaw` | number | ADC reading (0-4095) |
| `moisturePercent` | number | Moisture percentage used by control logic |
| `pumpOn` | boolean | Pump state at sample time |
| `mode` | `auto`/`manual` | Current operating mode |
| `rssi` | number | Wi-Fi strength in dBm |
| `uptimeMs` | number | Device uptime |
| `dryThreshold` | number | Active dry threshold (%) |
| `wetThreshold` | number | Active wet threshold (%) |

## 3) Built-in ML analysis script

Run from repository root:

```bash
npm run analyze:ml
```

Optional explicit file:

```bash
npm run analyze:ml -- --input data/telemetry-20260602-iisc-workshop.csv
```

If `--input` is omitted, the script automatically picks the latest `data/telemetry-*.csv` file.

Force synthetic lab dataset:

```bash
npm run analyze:ml -- --source synthetic
```

## 4) Web ML analysis page

Open:

- `http://localhost:3000/ml.html`

The page calls:

- `GET /api/ml/analysis` (auto source: CSV if available, synthetic fallback if not)
- `GET /api/ml/analysis?source=synthetic` (force synthetic)

The web view shows:

- Moisture timeline with pump ON overlay and thresholds
- Training threshold curve (F1 across candidate raw cutoffs)
- Training scatter and train/test metric cards
- Pump efficiency summary

## 5) What the script does

File: `scripts/analyze-ml.js`

### Preprocessing

- Parses and sorts rows by `timestamp`
- Drops invalid rows (bad timestamp or missing numeric moisture values)
- Converts `pumpOn` to boolean, thresholds to numeric values
- Engineers features:
  - `moistureRollingMean3` (3-sample rolling mean)
  - `moistureDelta` (difference from previous moisture %)
- Creates label:
  - `isDry = moisturePercent < dryThreshold`

### Train/evaluate split

- Chronological split (80% train, 20% test)
- No shuffling, to match time-series behavior

### Model

- Type: single-feature threshold classifier
- Feature: `moistureRaw`
- Training objective: choose `moistureRaw` cutoff that maximizes **train F1** for `isDry`

### Metrics reported

For both train and test sets:

- `accuracy`
- `precision`
- `recall`
- `f1`
- confusion counts (`tp`, `tn`, `fp`, `fn`)

### Irrigation-specific efficiency output

Also reports pump-cycle efficiency:

- number of pump-ON events
- number of completed wet-threshold cycles
- average seconds from pump-ON to reaching wet threshold

## 6) Output format

The script prints a JSON summary with:

- dataset and split sizes
- preprocessing summary (`droppedInvalidRows`, engineered features, label definition)
- learned threshold and train/test metrics
- pump efficiency event summary

Use this JSON as:

- workshop report evidence
- baseline before trying richer models
- input for dashboards/notebooks

## 7) Optional notebook workflow

For advanced plotting/modeling, continue with pandas:

```python
import pandas as pd

df = pd.read_csv("data/telemetry-20260602-iisc-workshop.csv", parse_dates=["timestamp"])
df = df.sort_values("timestamp")
```

Recommended next models (after baseline):

1. Logistic regression with `moistureRaw`, rolling mean, and delta features
2. Time-to-wet regression for pump efficiency prediction
3. Anomaly detection for sudden moisture drops or sensor disconnections
