"""Inference: recursive multi-step forecast at the station's own observation interval."""
import json
import os

import joblib
import numpy as np
import pandas as pd

from app.config import MODEL_DIR
from app.db import db
from ml.features import ENV_COLS, MODEL_FILES, TARGET, add_derived, season, to_inputs

_cache = {}


def _meta():
    path = os.path.join(MODEL_DIR, "meta.json")
    if not os.path.exists(path):
        raise FileNotFoundError("Models have not been trained yet. Run `python -m ml.train` in the backend folder.")
    if _cache.get("meta_mtime") != os.path.getmtime(path):  # reload after retraining
        _cache.clear()
        with open(path) as f:
            _cache["meta"] = json.load(f)
        _cache["scalers"] = joblib.load(os.path.join(MODEL_DIR, "scalers.joblib"))
        _cache["meta_mtime"] = os.path.getmtime(path)
    return _cache["meta"], _cache["scalers"]


def _model(name):
    if name not in MODEL_FILES:
        raise ValueError(f"Unknown model: {name}")
    if name not in _cache:
        path = os.path.join(MODEL_DIR, MODEL_FILES[name])
        if not os.path.exists(path):
            raise FileNotFoundError(f"Trained {name} model not found. Run `python -m ml.train`.")
        if path.endswith(".keras"):
            from ml.lstm import LSTMRegressor, available
            if not available():
                raise FileNotFoundError("The LSTM needs TensorFlow. Run: pip install -r requirements-lstm.txt")
            meta, _ = _meta()
            _cache[name] = LSTMRegressor.load(path, meta["window"], len(meta["features"]))
        else:
            _cache[name] = joblib.load(path)
    return _cache[name]


def _frequency(days):
    if days <= 1.5: return "daily"
    if days <= 8: return "weekly"
    if days <= 45: return "monthly"
    if days <= 135: return "quarterly (about 4 readings a year)"
    if days <= 200: return "half-yearly"
    return "annual / irregular"


def predict_station(station_id: str, model_name: str, steps: int = 1):
    meta, sc = _meta()
    model = _model(model_name)
    feats, W, env = meta["features"], meta["window"], meta["env"]

    cols = {"_id": 0, "date": 1, TARGET: 1, **{c: 1 for c in ENV_COLS}}
    df = pd.DataFrame(list(db.observations.find({"station_id": station_id, TARGET: {"$ne": None}}, cols)))
    if df.empty:
        raise ValueError("This station has no groundwater observations.")
    for c in ENV_COLS:
        df[c] = pd.to_numeric(df[c], errors="coerce") if c in df else np.nan
    df["date"] = pd.to_datetime(df["date"])
    df = df.groupby("date", as_index=False).mean(numeric_only=True).sort_values("date").reset_index(drop=True)
    if len(df) < W:
        raise ValueError(f"This station has only {len(df)} readings; the models need at least {W}.")

    df[env] = df[env].ffill().fillna(meta["medians"])
    df["station_id"] = station_id
    df = add_derived(df).reset_index(drop=True)
    recent = df["gap_days"].iloc[-min(len(df), 12):].iloc[1:] if len(df) > 1 else df["gap_days"]
    step_days = max(1, int(round(float(np.median(recent)))))
    clim = df.assign(m=df["date"].dt.month).groupby("m")[env].mean() if env else pd.DataFrame()

    win = df[feats].iloc[-W:].to_numpy(dtype="float64").tolist()
    date = df["date"].iloc[-1]
    preds = []
    for _ in range(steps):
        date = date + pd.Timedelta(days=step_days)
        s, c = season(date.month)
        x, last = to_inputs(np.array([win]), [step_days], [s], [c])
        change = sc["y"].inverse_transform(np.asarray(model.predict(sc["x"].transform(x))).reshape(-1, 1))[0, 0]
        depth = float(max(0.0, last[0] + change))
        preds.append({"date": date.date().isoformat(), "depth_mbgl": round(depth, 3)})
        # the future environment is unknown, so the next input row uses this station's average for that month
        env_vals = {e: (float(clim.loc[date.month, e]) if date.month in clim.index and pd.notna(clim.loc[date.month, e])
                        else meta["medians"][e]) for e in env}
        row = {TARGET: depth, **env_vals, "month_sin": s, "month_cos": c, "gap_days": step_days}
        win = win[1:] + [[row[f] for f in feats]]

    hist = df.tail(60)
    return {
        "predictions": preds,
        "last_observed": {"date": df["date"].iloc[-1].date().isoformat(), "depth_mbgl": float(df[TARGET].iloc[-1])},
        "history": [{"date": d.date().isoformat(), "depth_mbgl": float(v)} for d, v in zip(hist["date"], hist[TARGET])],
        "step_days": step_days,
        "frequency": _frequency(step_days),
        "window": W,
    }
