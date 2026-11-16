# Bhujal — project guide for coding agents

Bhujal (भूजल, "groundwater") is a university research web app: groundwater level prediction for Odisha, India.
Full title: "Machine Learning-Based Groundwater Level Prediction Using Environmental Data: A Case Study of Odisha".
Brand name in the UI is **Bhujal**. Never brand it with "AI" (no "GroundWater AI", "Bhujal AI", etc.).

## Stack
- `frontend/` React 18 + Vite + Tailwind 3 + Recharts + react-leaflet + lucide-react. Router: react-router-dom 6.
- `backend/` Python FastAPI + pymongo (MongoDB) + scikit-learn. Auth: bcrypt + JWT (PyJWT).
- No GPU. Models: Linear Regression, Random Forest, HistGradientBoosting ("Gradient Boosting"), MLPRegressor ("MLP Neural Network"),
  plus an optional "LSTM" (`ml/lstm.py`, TensorFlow on CPU) that `ml/train.py` trains only when TensorFlow is installed
  (`pip install -r requirements-lstm.txt`; skip with `--no-lstm`). The Predict page lists only models that have results.
- The user's earlier notebook LSTM (`groundwater_lstm.keras`) is NOT used: it scaled the target twice, kept ±2,000 m outliers
  and mixed sign conventions, so it predicted a constant (about -9.78) for every reading. Do not wire it in.

## Layout
```
backend/app/        main.py (app, /api/health) · auth.py · data.py · dashboard.py · predict.py · db.py · config.py
backend/ml/         features.py (samples) · train.py · infer.py · lstm.py (optional LSTM wrapper)
backend/scripts/    prepare_kaggle_odisha.py (Kaggle file -> Odisha CSV) · ingest.py (CSV -> MongoDB)
backend/data/       odisha_groundwater.csv (prepared data) · ODISHA_DISTRICTS.geojson (2011 Census boundaries)
frontend/src/pages/ Landing · Login · Dashboard · Predict · MapPage · DataExplorer · Models
frontend/src/lib/   api.js (all API calls) · auth.jsx · hooks.js (useFetch) · utils.jsx (formatters, colours, WellTypeToggle)
frontend/public/    odisha_districts.geojson (simplified, used by the map)
```

## Run (Windows: activate with `.venv\Scripts\activate`)
```bash
# MongoDB must be running on mongodb://localhost:27017 (or set MONGO_URI in backend/.env)
cd backend && python -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt
cp .env.example .env
python -m scripts.ingest data/odisha_groundwater.csv --no-state-filter
python -m ml.train
uvicorn app.main:app --reload --port 8000
cd ../frontend && npm install && npm run dev      # http://localhost:5173, /api proxied to :8000
```
API docs: http://localhost:8000/docs. Every route except `/api/health` and `/api/auth/*` needs `Authorization: Bearer <token>`.

## Data facts (do not contradict these)
- Source: Kaggle "India Groundwater Climate Time-Series (1994–2025)". Odisha subset: 432 wells, 22 districts, 26,525 readings.
- Two well types in `station_type`: `manual` (410 wells, ~4 readings/year, 1994–2025) and `telemetric` (22 sensor wells, daily, 2023–2025).
- Depth field is `depth_mbgl` (metres below ground level, positive = below ground).
- Environmental fields present: `rainfall_mm` (mm/day on the reading day), `temperature_c`. Soil moisture and land cover are NOT in the data.

## Rules that must not be broken
- Never invent data: no fake stations, coordinates, measurements, predictions or metrics. If data or trained models are missing, show an empty or error state that says what to run.
- Always label measured vs predicted values separately; predictions are "estimates, not measurements".
- Depth is always shown in mbgl; depth charts use a reversed y-axis (deeper = lower).
- Forecast steps follow each well's own reading interval. Do not offer finer-than-observed or village/GPS-level predictions.
- Metrics shown in the UI must come from `model_results` written by `ml/train.py`. Report per well type and against the "repeat last reading" baseline.
- Do not claim the method is novel.
- Keep the chronological train/test split and fit scalers on training data only.

## Conventions
- Frontend data access goes through `src/lib/api.js` and `useFetch`; every data card handles loading, error and empty states (`components/States.jsx`, `ChartCard.jsx`).
- Colours come from Tailwind tokens in `tailwind.config.js` (`forest`, `aqua`, `emerald`, `mist`). Fonts: Fraunces (display), DM Sans (body).
- Backend filters: most endpoints accept `district`, `station_id`, `station_type`; build queries with `scope_query()` in `app/data.py`.
- After changing `ml/features.py` or `ml/train.py`, retrain (`python -m ml.train`) before testing predictions.
- Before finishing frontend work run `npm run build`; before finishing backend work run `python -m py_compile app/*.py ml/*.py scripts/*.py`.
