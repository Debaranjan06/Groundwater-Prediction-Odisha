# Bhujal — Odisha Groundwater Observatory

**Machine Learning-Based Groundwater Level Prediction Using Environmental Data: A Case Study of Odisha**

*Bhujal* (भूजल) means "groundwater".

Working in Google Antigravity: open this folder as the workspace. `AGENTS.md`, `.agents/rules/` and `.agents/skills/` give the agent the project context.

React + Tailwind + Recharts + Leaflet frontend · FastAPI backend · MongoDB · scikit-learn
(Linear Regression, Random Forest, Gradient Boosting, MLP neural network). Everything runs on an ordinary laptop CPU.

## Dataset

Source: Kaggle, "India Groundwater Climate Time-Series (1994–2025)" (`Groundwater India Data.csv`, 416,952 rows, 6,440 wells).
The Kaggle file encodes state and district as numbers only, so `scripts/prepare_kaggle_odisha.py` selects Odisha wells by
location against the official 2011 Census district boundaries (`backend/data/ODISHA_DISTRICTS.geojson`).

Odisha subset (already prepared in `backend/data/odisha_groundwater.csv`):

| Well type | Wells | Readings | Period | Frequency | Sign in the Kaggle `target` column |
| --- | --- | --- | --- | --- | --- |
| Manual dug wells | 410 | 19,457 | Apr 1994 – Jan 2025 | ~4 a year (Jan, Apr/May, Aug, Nov) | positive = below ground |
| Sensor (telemetric) wells | 22 | 7,068 | Feb 2023 – Sep 2025 | daily | negative = below ground |

* 432 wells in 22 of Odisha's 30 districts (the other 8 have no wells in the file).
* Both types are converted to depth in metres below ground level (mbgl). 47 readings whose sign contradicts the well type are dropped.
* Environmental inputs: rainfall (mm/day on the reading day) and 2 m air temperature (°C). Soil moisture and land cover are not in the dataset; the app says so instead of inventing them.

## Results (test set = latest 20% of each well type's readings, never seen in training)

Mean absolute error in metres:

| Model | Manual wells (test from 10 Jan 2019, 3,584 readings) | Sensor wells (test from 14 May 2025, 1,407 readings) |
| --- | --- | --- |
| Linear Regression | 0.930 | 0.705 |
| **Random Forest** | **0.824** | 0.584 |
| Gradient Boosting | 0.853 | 0.605 |
| MLP Neural Network | 0.881 | 0.654 |
| LSTM (optional, TensorFlow on CPU) | 0.845 | 0.599 |
| Baseline: repeat the last reading | 1.461 | **0.564** |

* On manual wells read 4 times a year, every model beats the baseline; Random Forest is about 44% better.
* On daily sensor wells, nothing beats repeating yesterday's reading: day-to-day changes are tiny.
* R² is about 0.96 for every model and 0.92 for the baseline, mainly because wells differ a lot in depth, so compare against the baseline instead.

(Re-running `python -m ml.train` reproduces these numbers; Random Forest and the MLP can vary slightly between machines.)

## Method

1. `prepare_kaggle_odisha.py`: Odisha wells by point-in-polygon, district names, one depth scale (mbgl), simplified district map for the website.
2. `ingest.py`: loads the CSV into MongoDB (`stations`, `observations`).
3. `ml/train.py`:
   * each sample predicts a well's next reading from its previous 4 readings (depth, rainfall, temperature, season, days between readings), plus the days until the next reading and its month;
   * the models predict the **change** from the last reading, so one model fits shallow and deep wells;
   * chronological split per well type; missing values filled from past values only; scalers fitted on training data only;
   * samples with more than 400 days between readings are skipped.
4. `ml/infer.py`: forecasts 1–4 steps ahead at the well's own reading interval (quarterly or daily). Future rainfall and temperature are unknown, so each step uses that well's average for the month.

## Setup

### 1. MongoDB
Install MongoDB Community and run it locally (`mongodb://localhost:27017`), or use a free MongoDB Atlas cluster and put its URI in `backend/.env`.

### 2. Backend
```bash
cd backend
python -m venv .venv && source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env                                    # set JWT_SECRET (any long random text) and MONGO_URI
python -m scripts.ingest data/odisha_groundwater.csv --no-state-filter
pip install -r requirements-lstm.txt                    # optional: adds the LSTM (TensorFlow, CPU)
python -m ml.train                                      # about 30 s, or about 1.5 min with the LSTM
uvicorn app.main:app --reload --port 8000
```

To rebuild the Odisha CSV from the original Kaggle file (needs `pip install shapely`):
```bash
python -m scripts.prepare_kaggle_odisha "Groundwater India Data.csv" data/ODISHA_DISTRICTS.geojson \
  --out data/odisha_groundwater.csv --map-out ../frontend/public/odisha_districts.geojson
```

### 3. Frontend
```bash
cd frontend
npm install
npm run dev            # http://localhost:5173 (proxies /api to port 8000)
```
Create an account on the login page, then open the dashboard.

## Pages
Landing (live dataset figures) · Login/Register · Dashboard (well-type filter, seasonal history, per-well trend, actual vs predicted,
rainfall relationship, district comparison) · Predictions · Station map (district boundaries, depth colours, sensor wells outlined) ·
Data explorer (search, sort, date filter, CSV export, missing-value badges) · Model comparison (per-well-type results vs baseline).

## Scientific notes
* Measured and predicted depths are labelled separately everywhere; predictions are estimates for a monitoring well, not for villages or GPS points.
* The dashboard trend is the median of per-well least-squares slopes (wells with 8+ readings over 3+ years), not a slope of the all-well average, because wells start and stop reporting.
* "Latest observed depth" is the median of each well's latest reading, using only wells that reported in the final 12 months.
* Forecast steps follow each well's own interval; nothing finer than the data is offered.

## API (all except `/api/health` and `/api/auth/*` need a Bearer token)
`POST /api/auth/register|login`, `GET /api/auth/me`, `/api/districts`, `/api/stations`, `/api/stations/{id}`, `/api/observations` (+`/export`),
`/api/environment`, `/api/dashboard/{stats,series,seasonal,district-comparison,rainfall-relationship}`,
`/api/models/{performance,compare-series}`, `POST /api/predict`, `/api/predictions`. Most accept `district`, `station_id` and `station_type`.
Interactive docs: http://localhost:8000/docs
