import datetime as dt
from typing import Literal, Optional

import pandas as pd
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from .auth import get_current_user
from .db import db

router = APIRouter(prefix="/api", tags=["predictions"], dependencies=[Depends(get_current_user)])
ModelName = Literal["Linear Regression", "Random Forest", "Gradient Boosting", "MLP Neural Network", "LSTM"]


class PredictIn(BaseModel):
    station_id: str
    model: ModelName
    steps: int = Field(1, ge=1, le=4)


@router.get("/models/performance")
def performance():
    order = {"Linear Regression": 0, "Random Forest": 1, "Gradient Boosting": 2, "MLP Neural Network": 3, "LSTM": 4}
    docs = list(db.model_results.find({}, {"_id": 0}))
    return sorted(docs, key=lambda d: order.get(d["model"], 9))


@router.get("/models/compare-series")
def compare_series(station_id: Optional[str] = None, district: Optional[str] = None,
                   station_type: Optional[str] = None):
    q = {}
    if station_id:
        q["station_id"] = station_id
    else:
        if district:
            q["station_id"] = {"$in": db.stations.distinct("station_id", {"district": district})}
        if station_type:
            q["station_type"] = station_type
    docs = list(db.test_predictions.find(q, {"_id": 0}))
    if not docs:
        return []
    df = pd.DataFrame(docs)
    df["date"] = pd.to_datetime(df["date"])
    fmt = "%Y-%m-%d" if station_id else "%Y-%m"
    df["period"] = df["date"].dt.strftime(fmt)
    actual = df.groupby("period")["actual"].mean()
    pred = df.pivot_table(index="period", columns="model", values="predicted", aggfunc="mean")
    out = pred.join(actual).sort_index().reset_index()
    out = out.astype(object).where(out.notna(), None)
    return out.to_dict(orient="records")


@router.post("/predict")
def predict(body: PredictIn, user=Depends(get_current_user)):
    from ml.infer import predict_station  # lazy: loads trained models on first use

    station = db.stations.find_one({"station_id": body.station_id}, {"_id": 0})
    if not station:
        raise HTTPException(404, "Station not found")
    try:
        result = predict_station(body.station_id, body.model, body.steps)
    except FileNotFoundError as e:
        raise HTTPException(503, str(e))
    except ValueError as e:
        raise HTTPException(422, str(e))

    perf = db.model_results.find_one({"model": body.model}, {"_id": 0, "test": 1})
    doc = {
        "station_id": body.station_id,
        "station_name": station.get("station_name"),
        "district": station.get("district"),
        "model": body.model,
        "steps": body.steps,
        "predictions": result["predictions"],
        "last_observed": result["last_observed"],
        "history": result["history"],
        "step_days": result["step_days"],
        "window": result["window"],
        "station_type": station.get("station_type"),
        "frequency": result["frequency"],
        "model_test_metrics": perf["test"] if perf else None,
        "user_id": str(user["_id"]),
        "created_at": dt.datetime.now(dt.timezone.utc),
    }
    res = db.predictions.insert_one(doc)
    doc["id"] = str(res.inserted_id)
    doc.pop("_id", None)
    return doc


@router.get("/predictions")
def history(limit: int = 20, user=Depends(get_current_user)):
    cur = db.predictions.find({"user_id": str(user["_id"])}, {"history": 0}).sort("created_at", -1).limit(min(limit, 100))
    out = []
    for d in cur:
        d["id"] = str(d.pop("_id"))
        out.append(d)
    return out
