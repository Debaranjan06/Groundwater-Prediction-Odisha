import csv
import datetime as dt
import io
import re
from typing import Optional

import numpy as np
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse

from .auth import get_current_user
from .db import db

router = APIRouter(prefix="/api", tags=["data"], dependencies=[Depends(get_current_user)])

PARAMS = {
    "depth_mbgl": "Groundwater depth (mbgl)",
    "rainfall_mm": "Rainfall (mm)",
    "temperature_c": "Temperature (°C)",
    "soil_moisture": "Soil moisture",
    "land_cover": "Land cover",
}
ENV_KEYS = ["rainfall_mm", "temperature_c", "soil_moisture", "land_cover"]


def category(depth):
    if depth is None:
        return None
    if depth <= 5:
        return "0–5 mbgl"
    if depth <= 10:
        return "5–10 mbgl"
    if depth <= 20:
        return "10–20 mbgl"
    return "> 20 mbgl"


def frequency_label(days):
    if days is None:
        return "unknown"
    if days <= 1.5:
        return "daily"
    if days <= 8:
        return "weekly"
    if days <= 45:
        return "monthly"
    if days <= 135:
        return "quarterly (about 4 readings a year)"
    if days <= 200:
        return "half-yearly"
    return "annual / irregular"


def parse_date(s: Optional[str]):
    if not s:
        return None
    try:
        return dt.datetime.fromisoformat(s)
    except ValueError:
        raise HTTPException(400, f"Invalid date: {s}")


def scope_query(station_id=None, district=None, start=None, end=None, search=None, station_type=None):
    q = {}
    if station_id:
        q["station_id"] = station_id
    if district:
        q["district"] = district
    if station_type and not station_id:
        q["station_type"] = station_type
    d0, d1 = parse_date(start), parse_date(end)
    if d0 or d1:
        q["date"] = {}
        if d0:
            q["date"]["$gte"] = d0
        if d1:
            q["date"]["$lte"] = d1
    if search:
        q["station_name"] = {"$regex": re.escape(search), "$options": "i"}
    return q


def latest_by_station(match=None):
    pipe = [{"$match": {**(match or {}), "depth_mbgl": {"$ne": None}}},
            {"$sort": {"date": -1}},
            {"$group": {"_id": "$station_id", "date": {"$first": "$date"},
                        "depth": {"$first": "$depth_mbgl"}, "n": {"$sum": 1}}}]
    return {r["_id"]: r for r in db.observations.aggregate(pipe, allowDiskUse=True)}


@router.get("/districts")
def districts():
    rows = db.stations.aggregate([
        {"$match": {"district": {"$ne": None}}},
        {"$group": {"_id": "$district", "stations": {"$sum": 1}}},
        {"$sort": {"_id": 1}},
    ])
    return [{"district": r["_id"], "stations": r["stations"]} for r in rows]


@router.get("/stations")
def stations(district: Optional[str] = None, station_type: Optional[str] = None):
    q = scope_query(district=district, station_type=station_type)
    latest = latest_by_station(q)
    out = []
    for s in db.stations.find(q, {"_id": 0}).sort("station_name", 1):
        l = latest.get(s["station_id"])
        s["latest_depth"] = l["depth"] if l else None
        s["latest_date"] = l["date"] if l else None
        s["obs_count"] = l["n"] if l else 0
        s["category"] = category(s["latest_depth"])
        out.append(s)
    return out


@router.get("/stations/{station_id}")
def station_detail(station_id: str):
    s = db.stations.find_one({"station_id": station_id}, {"_id": 0})
    if not s:
        raise HTTPException(404, "Station not found")
    dates = [r["date"] for r in db.observations.find(
        {"station_id": station_id, "depth_mbgl": {"$ne": None}}, {"date": 1, "_id": 0}).sort("date", 1)]
    median_days = None
    if len(dates) > 1:
        gaps = np.diff(np.array(dates, dtype="datetime64[s]")).astype("timedelta64[s]").astype(float) / 86400
        median_days = float(np.median(gaps))
    sums = {k: {"$sum": {"$cond": [{"$gt": [f"${k}", None]}, 1, 0]}} for k in PARAMS}
    avail = next(iter(db.observations.aggregate([
        {"$match": {"station_id": station_id}},
        {"$group": {"_id": None, "total": {"$sum": 1}, **sums}}])), None) or {"total": 0}
    latest = db.observations.find_one({"station_id": station_id, "depth_mbgl": {"$ne": None}},
                                      sort=[("date", -1)])
    return {
        **s,
        "obs_count": len(dates),
        "first_date": dates[0] if dates else None,
        "last_date": dates[-1] if dates else None,
        "median_interval_days": median_days,
        "frequency": frequency_label(median_days),
        "latest_depth": latest["depth_mbgl"] if latest else None,
        "category": category(latest["depth_mbgl"]) if latest else None,
        "availability": [{"key": k, "label": v, "count": avail.get(k, 0), "total": avail.get("total", 0)}
                         for k, v in PARAMS.items()],
    }


SORTABLE = {"date", "station_name", "district", "station_type", "depth_mbgl", "rainfall_mm", "temperature_c",
            "soil_moisture", "land_cover"}


@router.get("/observations")
def observations(station_id: Optional[str] = None, district: Optional[str] = None,
                 start: Optional[str] = None, end: Optional[str] = None, search: Optional[str] = None,
                 station_type: Optional[str] = None, sort_by: str = "date", order: str = "desc",
                 skip: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=500)):
    if sort_by not in SORTABLE:
        raise HTTPException(400, "Invalid sort column")
    q = scope_query(station_id, district, start, end, search, station_type)
    total = db.observations.count_documents(q)
    cur = db.observations.find(q, {"_id": 0}).sort(sort_by, -1 if order == "desc" else 1).skip(skip).limit(limit)
    return {"total": total, "items": list(cur)}


@router.get("/observations/export")
def export(station_id: Optional[str] = None, district: Optional[str] = None,
           start: Optional[str] = None, end: Optional[str] = None, search: Optional[str] = None,
           station_type: Optional[str] = None):
    q = scope_query(station_id, district, start, end, search, station_type)
    cols = ["date", "station_id", "station_name", "district", "station_type", "depth_mbgl", "rainfall_mm",
            "temperature_c", "soil_moisture", "land_cover"]

    def gen():
        buf = io.StringIO()
        w = csv.writer(buf)
        w.writerow(cols)
        yield buf.getvalue()
        for r in db.observations.find(q, {"_id": 0}).sort("date", 1).limit(200000):
            buf.seek(0)
            buf.truncate()
            r["date"] = r["date"].date().isoformat() if r.get("date") else ""
            w.writerow(["" if r.get(c) is None else r.get(c) for c in cols])
            yield buf.getvalue()

    return StreamingResponse(gen(), media_type="text/csv",
                             headers={"Content-Disposition": "attachment; filename=groundwater_observations.csv"})


@router.get("/environment")
def environment(station_id: Optional[str] = None, district: Optional[str] = None):
    q = scope_query(station_id, district)
    total = db.observations.count_documents(q)
    sums = {k: {"$sum": {"$cond": [{"$gt": [f"${k}", None]}, 1, 0]}} for k in PARAMS}
    avail = next(iter(db.observations.aggregate([{"$match": q}, {"$group": {"_id": None, **sums}}])), {})
    latest = {}
    for k in PARAMS:
        r = db.observations.find_one({**q, k: {"$ne": None}}, sort=[("date", -1)])
        if r:
            latest[k] = {"value": r[k], "date": r["date"]}
    series = db.observations.aggregate([
        {"$match": q},
        {"$group": {"_id": {"$dateToString": {"format": "%Y-%m", "date": "$date"}},
                    **{k: {"$avg": f"${k}"} for k in ENV_KEYS}}},
        {"$sort": {"_id": 1}},
    ])
    return {
        "availability": [{"key": k, "label": v, "count": avail.get(k, 0), "total": total} for k, v in PARAMS.items()],
        "latest": latest,
        "series": [{"period": r["_id"], **{k: r.get(k) for k in ENV_KEYS}} for r in series],
    }
