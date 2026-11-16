"""Shared feature engineering for training and inference.

Each sample predicts one reading from the `window` readings before it at the same station.
The models predict the CHANGE from the last measured depth (predicted depth = last depth + change), and the
window's depths are given relative to that last depth. This keeps one model valid for shallow and deep wells.
Input = the window's rows (relative depth, environment, season, days since previous reading) flattened, then
the last depth itself and three values known in advance for the target step: days until the target reading
and its calendar month (sin/cos). That lets one model handle quarterly manual wells and daily sensor wells.
"""
import numpy as np
import pandas as pd

TARGET = "depth_mbgl"
ENV_COLS = ["rainfall_mm", "temperature_c", "soil_moisture", "land_cover"]
WINDOW = 4
MODEL_FILES = {
    "Linear Regression": "linear_regression.joblib",
    "Random Forest": "random_forest.joblib",
    "Gradient Boosting": "gradient_boosting.joblib",
    "MLP Neural Network": "mlp.joblib",
    "LSTM": "lstm.keras",  # optional, trained only when TensorFlow is installed
}


def season(month):
    return np.sin(2 * np.pi * month / 12), np.cos(2 * np.pi * month / 12)


def add_derived(df: pd.DataFrame) -> pd.DataFrame:
    """Adds month_sin, month_cos and gap_days (days since the station's previous reading)."""
    df = df.sort_values(["station_id", "date"]).copy()
    df["month_sin"], df["month_cos"] = season(df["date"].dt.month)
    gap = df.groupby("station_id")["date"].diff().dt.days
    df["gap_days"] = gap.fillna(gap.groupby(df["station_id"]).transform("median")).fillna(90).astype("float32")
    return df


def row_features(env):
    return [TARGET] + env + ["month_sin", "month_cos", "gap_days"]


def to_inputs(windows, gap, msin, mcos):
    """windows: (n, w, F) with depth in column 0. Returns the model input matrix (gap stays at column -3)."""
    w = np.array(windows, dtype="float64")
    last = w[:, -1, 0].copy()
    w[:, :, 0] -= last[:, None]
    return np.hstack([w.reshape(len(w), -1), np.column_stack([last, gap, msin, mcos])]), last


def make_samples(df: pd.DataFrame, feats, window: int = WINDOW):
    """Returns X, y (absolute depth), dates, station ids, last observed depth (baseline and delta offset)."""
    X, y, dates, sids, last = [], [], [], [], []
    for sid, g in df.groupby("station_id", sort=False):
        if len(g) <= window:
            continue
        arr = g[feats].to_numpy(dtype="float64")
        sw = np.lib.stride_tricks.sliding_window_view(arr, window, axis=0)[:-1].transpose(0, 2, 1)  # (m, w, F)
        tgt = g.iloc[window:]
        xi, li = to_inputs(sw, tgt["gap_days"], tgt["month_sin"], tgt["month_cos"])
        X.append(xi)
        y.append(tgt[TARGET].to_numpy(dtype="float64"))
        dates.append(tgt["date"].to_numpy())
        sids.extend([sid] * len(tgt))
        last.append(li)
    if not X:
        n = window * len(feats) + 4
        return (np.empty((0, n)), np.empty(0), np.empty(0, "datetime64[ns]"), np.empty(0, object), np.empty(0))
    return np.vstack(X), np.concatenate(y), np.concatenate(dates), np.array(sids, dtype=object), np.concatenate(last)
