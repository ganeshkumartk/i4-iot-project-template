# Using workshop telemetry data — Analytics / ML follow-up

After the IoT hands-on session, moisture readings are saved on the facilitator machine.

## Get the data

1. **During/after workshop:**  
   `http://<facilitator-ip>:3000/api/data/export.csv`

2. **From disk:**  
   `smart-irrigation/data/telemetry-<session-id>.csv`

3. **JSON lines:**  
   `GET /api/data/export.jsonl`

## CSV columns

| Column | Description |
|--------|-------------|
| `timestamp` | ISO 8601 UTC when server received reading |
| `deviceId` | ESP32 id (e.g. `esp32-irrigation-01`) |
| `moistureRaw` | ADC value 0–4095 |
| `moisturePercent` | Computed moisture % |
| `pumpOn` | `true` / `false` |
| `mode` | `auto` or `manual` |
| `rssi` | Wi-Fi signal strength (dBm) |
| `uptimeMs` | ESP32 uptime |
| `dryThreshold` | Active dry threshold % |
| `wetThreshold` | Active wet threshold % |

## Python (pandas)

```python
import pandas as pd
import matplotlib.pyplot as plt

df = pd.read_csv("telemetry-20260602-iisc-a.csv", parse_dates=["timestamp"])
df = df.sort_values("timestamp")

# Moisture over time
df.plot(x="timestamp", y="moisturePercent", title="Soil moisture %")
plt.axhline(35, color="orange", linestyle="--", label="dry threshold")
plt.axhline(65, color="blue", linestyle="--", label="wet threshold")
plt.legend()
plt.show()

# Pump ON periods
pump_on = df[df["pumpOn"] == True]
print(f"Pump active for {len(pump_on)} samples")
```

## Simple ML ideas (next session)

1. **Binary classification:** Label rows dry (&lt;40%) vs wet (&gt;60%) from `moisturePercent`; train logistic regression on `moistureRaw`.
2. **Anomaly detection:** Flag sudden drops in moisture (leak / removed probe).
3. **Pump efficiency:** Time from pump ON until moisture crosses wet threshold.
4. **Feature engineering:** Rolling mean of `moisturePercent` over 3 samples; delta from previous row.

## Tips for a good dataset

- Run at least one full cycle: **dry → pump ON → wet → pump OFF**
- Vary probe placement (surface vs deep in cup)
- Include 2–3 manual mode toggles for labelled pump events
- Use a distinct `DATA_SESSION_ID` per workshop batch in `.env`
