from pymongo import MongoClient

from .config import MONGO_DB, MONGO_URI

client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=4000)
db = client[MONGO_DB]


def ensure_indexes():
    db.users.create_index("email", unique=True)
    db.stations.create_index("station_id", unique=True)
    db.stations.create_index("district")
    db.observations.create_index([("station_id", 1), ("date", 1)])
    db.observations.create_index("district")
    db.observations.create_index("date")
    db.predictions.create_index([("created_at", -1)])
    db.model_results.create_index("model", unique=True)
    db.test_predictions.create_index([("model", 1), ("station_id", 1)])
