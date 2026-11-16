from typing import Optional

import numpy as np
import pandas as pd
from fastapi import APIRouter, Depends

from .auth import get_current_user
from .data import latest_by_station, scope_query
from .db import db

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"], dependencies=[Depends(get_current_user)])


def _f(x):
    try:
        x = float(x)
    except (TypeError, ValueError):
        return None
    return x if np.isfinite(x) else None


def _monthly(q):
    return list(db.observations.aggregate([
        {"$match": {**q, "depth_mbgl": {"$ne": None}}},
        {"$group": {"_id": {"$dateToString": {"format": "%Y-%m", "date": "$date"}},
                    "depth": {"$avg": "$depth_mbgl"}, "rainfall": {"$avg": "$rainfall_mm"},
                    "stations": {"$addToSet": "$station_id"}, "n": {"$sum": 1}}},
        {"$sort": {"_id": 1}},
    ]))


def station_trends(q):
    """Least-squares slope (m/year) for every station with >= 8 readings spanning >= 3 years."""
    rows = list(db.observations.find({**q, "depth_mbgl": {"$ne": None}},
                                     {"_id": 0, "station_id": 1, "date": 1, "depth_mbgl": 1}))
    if not rows:
        return []
    df = pd.DataFrame(rows)
    df["t"] = pd.to_datetime(df["date"]).map(lambda d: d.year + (d.dayofyear - 1) / 365.25)
    out = []
    for sid, g in df.groupby("station_id"):
        if len(g) >= 8 and g.t.max() - g.t.min() >= 3:
            out.append(float(np.polyfit(g.t, g.depth_mbgl, 1)[0]))
    return out


@router.get("/stats")
def stats(station_id: Optional[str] = None, district: Optional[str] = None, station_type: Optional[str] = None):
    q = scope_query(station_id, district, station_type=station_type)
    st_q = {k: v for k, v in q.items() if k in ("station_id", "district", "station_type")}

    latest = latest_by_station(q)
    latest_obs = None
    if latest:
        newest = max(v["date"] for v in latest.values())
        recent = [v["depth"] for v in latest.values() if (newest - v["date"]).days <= 365]  # still-reporting wells
        latest_obs = {"value": _f(np.median(recent)), "date": newest, "stations": len(recent)}

    slopes = station_trends(q)
    trend = {"label": "Not enough long records", "slope_m_per_year": None, "stations": len(slopes)}
    if slopes:
        med = float(np.median(slopes))
        deeper = int(sum(s > 0 for s in slopes))
        label = ("Water table falling (depth increasing)" if med > 0.02 else
                 "Water table rising (depth decreasing)" if med < -0.02 else "Broadly stable")
        trend = {"label": label, "slope_m_per_year": med, "stations": len(slopes), "deepening": deeper}

    pq = {"station_id": station_id} if station_id else ({"district": district} if district else {})
    last_pred = db.predictions.find_one(pq, {"_id": 0, "history": 0}, sort=[("created_at", -1)])
    best = db.model_results.find_one({}, {"_id": 0}, sort=[("test.rmse", 1)])

    return {
        "total_stations": db.stations.count_documents({}),
        "selected_stations": db.stations.count_documents(st_q),
        "selected_districts": len([d for d in db.stations.distinct("district", st_q) if d]),
        "observations": db.observations.count_documents(q),
        "latest_observed": latest_obs,
        "latest_prediction": last_pred,
        "trend": trend,
        "best_model": ({"model": best["model"], "rmse": best["test"]["rmse"], "mae": best["test"]["mae"],
                        "r2": best["test"]["r2"]} if best else None),
    }


@router.get("/series")
def series(station_id: Optional[str] = None, district: Optional[str] = None, station_type: Optional[str] = None):
    return [{"period": r["_id"], "depth": _f(r["depth"]), "rainfall": _f(r["rainfall"]), "n": r["n"],
             "stations": len(r["stations"])}
            for r in _monthly(scope_query(station_id, district, station_type=station_type))]


@router.get("/seasonal")
def seasonal(station_id: Optional[str] = None, district: Optional[str] = None, station_type: Optional[str] = None):
    q = scope_query(station_id, district, station_type=station_type)
    rows = db.observations.aggregate([
        {"$match": {**q, "depth_mbgl": {"$ne": None}}},
        {"$group": {"_id": {"$month": "$date"}, "depth": {"$avg": "$depth_mbgl"},
                    "rainfall": {"$avg": "$rainfall_mm"}, "n": {"$sum": 1}}},
        {"$sort": {"_id": 1}},
    ])
    # hide months with very few readings so stray off-schedule readings don't look like a season
    rows = list(rows)
    total = sum(r["n"] for r in rows) or 1
    return [{"month": r["_id"], "depth": _f(r["depth"]), "rainfall": _f(r["rainfall"]), "n": r["n"]}
            for r in rows if r["n"] >= max(5, 0.01 * total)]


@router.get("/district-comparison")
def district_comparison(station_type: Optional[str] = None):
    q = scope_query(station_type=station_type)
    rows = db.observations.aggregate([
        {"$match": {**q, "depth_mbgl": {"$ne": None}, "district": {"$ne": None}}},
        {"$group": {"_id": "$district", "mean": {"$avg": "$depth_mbgl"}, "min": {"$min": "$depth_mbgl"},
                    "max": {"$max": "$depth_mbgl"}, "stations": {"$addToSet": "$station_id"}, "n": {"$sum": 1}}},
        {"$sort": {"mean": -1}},
    ])
    return [{"district": r["_id"], "mean": _f(r["mean"]), "min": _f(r["min"]), "max": _f(r["max"]),
             "stations": len(r["stations"]), "n": r["n"]} for r in rows]


@router.get("/rainfall-relationship")
def rainfall_relationship(station_id: Optional[str] = None, district: Optional[str] = None,
                          station_type: Optional[str] = None):
    q = scope_query(station_id, district, station_type=station_type)
    rows = [r for r in _monthly({**q, "rainfall_mm": {"$ne": None}}) if r["rainfall"] is not None]
    points = [{"period": r["_id"], "rainfall": _f(r["rainfall"]), "depth": _f(r["depth"])} for r in rows]
    corr = None
    if len(points) >= 5:
        x = np.array([p["rainfall"] for p in points])
        y = np.array([p["depth"] for p in points])
        if x.std() > 0 and y.std() > 0:
            corr = _f(np.corrcoef(x, y)[0, 1])
    return {"points": points, "pearson_r": corr}
