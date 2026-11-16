"""Train and evaluate four lightweight models on the observations stored in MongoDB.

Models: Linear Regression, Random Forest, Gradient Boosting, MLP Neural Network (scikit-learn, CPU only).
Run from the backend/ folder:   python -m ml.train
"""
import argparse
import datetime as dt
import json
import os

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingRegressor, RandomForestRegressor
from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.neural_network import MLPRegressor
from sklearn.preprocessing import StandardScaler

from app.config import MODEL_DIR
from app.db import db, ensure_indexes
from ml import lstm, portable
from ml.features import ENV_COLS, MODEL_FILES, TARGET, WINDOW, add_derived, make_samples, row_features

SEED = 42
MAX_GAP_DAYS = 400  # do not train or score on jumps of more than ~a year between readings


def metrics(y_true, y_pred):
    if len(y_true) == 0:
        return None
    return {
        "mae": float(mean_absolute_error(y_true, y_pred)),
        "rmse": float(np.sqrt(mean_squared_error(y_true, y_pred))),
        "r2": float(r2_score(y_true, y_pred)) if len(y_true) > 1 else None,
        "n": int(len(y_true)),
    }


def load_frame():
    cols = {"_id": 0, "station_id": 1, "date": 1, TARGET: 1, **{c: 1 for c in ENV_COLS}}
    df = pd.DataFrame(list(db.observations.find({TARGET: {"$ne": None}}, cols)))
    if df.empty:
        raise SystemExit("No observations in MongoDB. Run scripts/ingest.py first.")
    df["date"] = pd.to_datetime(df["date"])
    for c in ENV_COLS:
        if c not in df:
            df[c] = np.nan
        df[c] = pd.to_numeric(df[c], errors="coerce")
    df = df[(df[TARGET] >= 0) & (df[TARGET] <= 200)]
    df = df.groupby(["station_id", "date"], as_index=False).mean(numeric_only=True)
    return df.sort_values(["station_id", "date"]).reset_index(drop=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--window", type=int, default=WINDOW, help="number of past readings used as input")
    ap.add_argument("--test-frac", type=float, default=0.2, help="share of readings (latest in time) held out for testing")
    ap.add_argument("--no-lstm", action="store_true", help="skip the LSTM even if TensorFlow is installed")
    args = ap.parse_args()

    os.makedirs(MODEL_DIR, exist_ok=True)
    ensure_indexes()
    df = load_frame()
    types = {s["station_id"]: (s.get("station_type") or "unknown")
             for s in db.stations.find({}, {"_id": 0, "station_id": 1, "station_type": 1})}

    env = [c for c in ENV_COLS if df[c].notna().mean() >= 0.3]
    print(f"Readings: {len(df)} | stations: {df.station_id.nunique()} | environmental inputs: {env} | "
          f"not available: {[c for c in ENV_COLS if c not in env]}")

    # ---- chronological split, per well type: the latest share of each type's readings is the test set ----
    # (manual wells run 1994-2025 at ~4 readings/year, sensor wells 2023-2025 daily, so one shared date would
    #  leave almost no manual readings to test on)
    df["wtype"] = df["station_id"].map(types).fillna("unknown")
    cutoffs = df.groupby("wtype")["date"].quantile(1 - args.test_frac).to_dict()
    row_cut = df["wtype"].map(cutoffs)
    train_rows = df[df["date"] <= row_cut]

    # ---- missing values: carry forward within a station (past only), then training-period medians ----
    df[env] = df.groupby("station_id")[env].ffill()
    medians = {c: float(train_rows[c].median()) for c in env}
    df[env] = df[env].fillna(medians)
    df = add_derived(df)
    feats = row_features(env)

    X, y, d, sids, last = make_samples(df, feats, args.window)
    keep = X[:, -3] <= MAX_GAP_DAYS
    X, y, d, sids, last = X[keep], y[keep], d[keep], sids[keep], last[keep]
    stype = np.array([types.get(s, "unknown") for s in sids])
    cut = np.array([np.datetime64(cutoffs[t]) for t in stype], dtype="datetime64[ns]")
    tr, te = d <= cut, d > cut
    if te.sum() < 10 or tr.sum() < 40:
        raise SystemExit(f"Too few samples after the split (train {tr.sum()}, test {te.sum()}).")
    Xtr, ytr, ltr = X[tr], y[tr], last[tr]
    Xte, yte, dte, ste, lte, tte = X[te], y[te], d[te], sids[te], last[te], stype[te]
    for t, c in cutoffs.items():
        print(f"  {t}: train <= {c.date()} ({int((tr & (stype == t)).sum())} samples) | "
              f"test after ({int((te & (stype == t)).sum())} samples)")

    # ---- target = change from the last reading; scaling fitted on training data only ----
    dtr = (ytr - ltr).reshape(-1, 1)
    xs, ys = StandardScaler().fit(Xtr), StandardScaler().fit(dtr)
    Xtr_s, Xte_s = xs.transform(Xtr), xs.transform(Xte)
    ytr_s = ys.transform(dtr).ravel()
    inv = lambda a: ys.inverse_transform(np.asarray(a).reshape(-1, 1)).ravel()  # -> change in metres
    joblib.dump({"x": xs, "y": ys}, os.path.join(MODEL_DIR, "scalers.joblib"))

    def by_type(pred):
        return {t: metrics(yte[tte == t], pred[tte == t]) for t in sorted(set(tte))}

    baseline = {**metrics(yte, lte), "by_type": by_type(lte)}

    estimators = {
        "Linear Regression": LinearRegression(),
        "Random Forest": RandomForestRegressor(n_estimators=300, min_samples_leaf=3, max_features=0.5,
                                               n_jobs=-1, random_state=SEED),
        "Gradient Boosting": HistGradientBoostingRegressor(max_iter=400, learning_rate=0.05, max_leaf_nodes=31,
                                                           l2_regularization=1.0, early_stopping=False,
                                                           random_state=SEED),
        "MLP Neural Network": MLPRegressor(hidden_layer_sizes=(64, 32), alpha=1e-3, max_iter=500,
                                           early_stopping=True, random_state=SEED),
    }
    if args.no_lstm:
        print("LSTM skipped (--no-lstm).")
    elif lstm.available():
        estimators["LSTM"] = lstm.LSTMRegressor(args.window, len(feats), seed=SEED)
    else:
        print("LSTM skipped: TensorFlow is not installed (pip install -r requirements-lstm.txt to add it).")
    stale = os.path.join(MODEL_DIR, MODEL_FILES["LSTM"])
    if "LSTM" not in estimators and os.path.exists(stale):
        os.remove(stale)  # an old LSTM file must not outlive a retrain with different features

    now = dt.datetime.now(dt.timezone.utc)
    db.test_predictions.delete_many({})
    db.model_results.delete_many({"model": {"$nin": list(estimators)}})
    for name, mdl in estimators.items():
        print(f"Training {name} ...", flush=True)
        if name == "LSTM":
            mdl.fit(Xtr_s, ytr_s, dates=d[tr])
            mdl.save(os.path.join(MODEL_DIR, MODEL_FILES[name]))
        else:
            mdl.fit(Xtr_s, ytr_s)
            joblib.dump(mdl, os.path.join(MODEL_DIR, MODEL_FILES[name]))
        ptr = np.clip(ltr + inv(mdl.predict(Xtr_s)), 0, None)
        pte = np.clip(lte + inv(mdl.predict(Xte_s)), 0, None)
        doc = {"model": name, "train": metrics(ytr, ptr), "test": {**metrics(yte, pte), "by_type": by_type(pte)},
               "persistence_baseline_test": baseline,
               "features": feats + ["last depth", "next: days ahead", "next: month"],
               "target": "change from the last measured depth",
               "window": args.window, "cutoff_date": min(cutoffs.values()).to_pydatetime(),
               "cutoff_by_type": {t: c.to_pydatetime() for t, c in cutoffs.items()},
               "n_stations": int(df.station_id.nunique()), "trained_at": now}
        db.model_results.replace_one({"model": name}, doc, upsert=True)
        db.test_predictions.insert_many([
            {"model": name, "station_id": str(ste[i]), "station_type": str(tte[i]),
             "date": pd.Timestamp(dte[i]).to_pydatetime(), "actual": float(yte[i]), "predicted": float(pte[i])}
            for i in range(len(yte))])
        bt = " | ".join(f"{t}: MAE {m['mae']:.3f}" for t, m in doc["test"]["by_type"].items() if m)
        print(f"{name:20s} test MAE={doc['test']['mae']:.3f} RMSE={doc['test']['rmse']:.3f} "
              f"R2={doc['test']['r2']:.3f}  ({bt})")
    bt = " | ".join(f"{t}: MAE {m['mae']:.3f}" for t, m in baseline["by_type"].items() if m)
    print(f"{'Repeat last value':20s} test MAE={baseline['mae']:.3f} RMSE={baseline['rmse']:.3f} "
          f"R2={baseline['r2']:.3f}  ({bt})")

    with open(os.path.join(MODEL_DIR, "meta.json"), "w") as f:
        json.dump({"features": feats, "env": env, "window": args.window, "medians": medians,
                   "cutoff_by_type": {t: str(c.date()) for t, c in cutoffs.items()},
                   "trained_at": now.isoformat()}, f, indent=2)
    print("Exported NumPy copies for deployment:", portable.export(MODEL_DIR))
    print("Done. Models saved to", MODEL_DIR)


if __name__ == "__main__":
    main()
