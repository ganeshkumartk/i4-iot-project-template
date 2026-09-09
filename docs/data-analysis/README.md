# Smart Irrigation — Data Analysis & ML Lab

Companion lab to the IoT hands-on session. Uses the same telemetry schema your bench
exports (`GET /api/data/export.csv`), scaled up to a full cohort's worth of logged
sessions so there's enough data to actually train and evaluate a model.

## Files

| File | What it is |
|---|---|
| `Smart_Irrigation_Data_Analysis_and_ML_Lab.ipynb` | the lab — run top to bottom |
| `telemetry-training.csv` | benches 01–05, 3 workshop sessions each (~10,000 rows) |
| `telemetry-holdout.csv` | bench-06 — deliberately held back to test generalization |
| `generate_data.py` | the simulator that produced both CSVs, if you want to regenerate with different physics or add more benches/sessions |

## Running it

```bash
pip install pandas numpy matplotlib scikit-learn ipywidgets jupyter
jupyter notebook Smart_Irrigation_Data_Analysis_and_ML_Lab.ipynb
```

Works in Jupyter Notebook, JupyterLab, VS Code's notebook viewer, and Google Colab
(upload the two CSVs alongside the notebook, or mount them from Drive). The sliders
use `ipywidgets.interact` and need a live kernel — a static HTML export won't render
them.

## What's real and what's simulated

The data is generated, not captured from an actual cohort — but the physics behind it
(evaporation pulling moisture down, the pump pushing it up, hysteresis between
`dryThreshold`/`wetThreshold`, per-device sensor calibration drift, sensor glitches,
dropped packets) is the same physics your bench runs on. Everything the notebook
teaches about cleaning, feature engineering, and forecasting applies directly the
first time you export a real session and drop it in place of these files.
