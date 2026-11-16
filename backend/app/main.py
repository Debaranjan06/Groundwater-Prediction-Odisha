from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import auth, dashboard, data, predict
from .config import CORS_ORIGINS
from .db import db, ensure_indexes


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        ensure_indexes()
    except Exception as e:  # keep the API up so /api/health can report the problem
        print(f"[warn] MongoDB not reachable at startup: {e}")
    yield


app = FastAPI(title="Bhujal API – Odisha groundwater", version="1.0.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=CORS_ORIGINS, allow_credentials=True,
                   allow_methods=["*"], allow_headers=["*"])

for r in (auth.router, data.router, dashboard.router, predict.router):
    app.include_router(r)


@app.get("/api/health")
def health():
    try:
        db.command("ping")
        first = db.observations.find_one({}, {"date": 1}, sort=[("date", 1)])
        last = db.observations.find_one({}, {"date": 1}, sort=[("date", -1)])
        return {"status": "ok", "database": "connected", "stations": db.stations.count_documents({}),
                "districts": len([d for d in db.stations.distinct("district") if d]),
                "observations": db.observations.estimated_document_count(),
                "first_date": first["date"] if first else None, "last_date": last["date"] if last else None,
                "trained_models": db.model_results.count_documents({})}
    except Exception as e:
        return {"status": "degraded", "database": "unreachable", "detail": str(e)[:200]}
