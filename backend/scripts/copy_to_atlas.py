"""Copy every collection from the local MongoDB to a cloud MongoDB (e.g. Atlas) for the live deployment.

Usage (from the backend folder):
    python -m scripts.copy_to_atlas "mongodb+srv://user:pass@cluster.mongodb.net/"

Source defaults to mongodb://localhost:27017; override with --source. Target collections are replaced.
"""
import argparse

from pymongo import MongoClient

from app.config import MONGO_DB

BATCH = 2000


def main():
    p = argparse.ArgumentParser()
    p.add_argument("target_uri")
    p.add_argument("--source", default="mongodb://localhost:27017")
    p.add_argument("--db", default=MONGO_DB)
    a = p.parse_args()

    src = MongoClient(a.source, serverSelectionTimeoutMS=5000)[a.db]
    dst = MongoClient(a.target_uri, serverSelectionTimeoutMS=15000)[a.db]
    dst.client.admin.command("ping")

    for name in src.list_collection_names():
        dst[name].drop()
        batch, n = [], 0
        for doc in src[name].find():
            batch.append(doc)
            if len(batch) >= BATCH:
                dst[name].insert_many(batch, ordered=False)
                n += len(batch)
                batch = []
        if batch:
            dst[name].insert_many(batch, ordered=False)
            n += len(batch)
        for idx in src[name].list_indexes():
            if idx["name"] == "_id_":
                continue
            opts = {k: v for k, v in idx.items() if k not in ("key", "v", "ns")}
            dst[name].create_index(list(idx["key"].items()), **opts)
        print(f"{name}: {n} documents")
    print("Done.")


if __name__ == "__main__":
    main()
