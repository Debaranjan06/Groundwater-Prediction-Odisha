---
name: run-bhujal
description: Set up, load data, train models and start the Bhujal app locally (MongoDB + FastAPI + Vite). Use when asked to run, start, reset, retrain or demo the project.
---

# Run Bhujal locally

1. Check MongoDB is reachable: `mongosh --eval "db.runCommand({ping:1})"` (or check that the MongoDB service is running). If it isn't installed, tell the user to install MongoDB Community Server or set `MONGO_URI` in `backend/.env` to a MongoDB Atlas connection string.
2. Backend environment (from `backend/`):
   - Create `.venv` if missing: `python -m venv .venv`, then activate it (`.venv\Scripts\activate` on Windows, `source .venv/bin/activate` elsewhere).
   - `pip install -r requirements.txt`
   - Copy `.env.example` to `.env` if `.env` is missing, and set `JWT_SECRET` to a long random string.
3. Load data: `python -m scripts.ingest data/odisha_groundwater.csv --no-state-filter`. Expect 26,525 readings, 432 stations and 22 districts.
4. Train: `python -m ml.train`. Expect four models plus a "Repeat last value" line, and a per-type MAE in the output.
5. Start the API: `uvicorn app.main:app --reload --port 8000`. Check that `http://localhost:8000/api/health` reports `"status":"ok"`.
6. Frontend (from `frontend/`): `npm install` (first time only), then `npm run dev`. Open http://localhost:5173 and register an account on the login page.

Rebuilding the Odisha CSV from the original Kaggle file is optional and needs `pip install shapely`:
`python -m scripts.prepare_kaggle_odisha "<path to Groundwater India Data.csv>" data/ODISHA_DISTRICTS.geojson --out data/odisha_groundwater.csv --map-out ../frontend/public/odisha_districts.geojson`
