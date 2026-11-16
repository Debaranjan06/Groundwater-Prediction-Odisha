"""Load a Kaggle CSV of CGWB groundwater data into MongoDB (Odisha only).

  python -m scripts.ingest data.csv --inspect          # show columns + detected mapping, write nothing
  python -m scripts.ingest data.csv                    # ingest (replaces existing observations)
  python -m scripts.ingest data.csv --map depth_mbgl="Water Level" --map date=Obs_Date
  python -m scripts.ingest data.csv --no-state-filter  # if the file has no state column
"""
import argparse
import re

import numpy as np
import pandas as pd

from app.db import db, ensure_indexes

ALIASES = {
    "station_id": ["stationcode", "stationid", "siteid", "wellid", "wellno", "code"],
    "station_name": ["stationname", "station", "sitename", "site", "wellname", "location", "name"],
    "district": ["district", "districtname"],
    "state": ["state", "statename"],
    "latitude": ["latitude", "lat"],
    "longitude": ["longitude", "lon", "long", "lng"],
    "date": ["date", "datetime", "observationdate", "measurementdate", "timestamp", "time"],
    "year": ["year"],
    "month": ["month"],
    "depth_mbgl": ["depthmbgl", "waterleveldepth", "depthtowaterlevel", "groundwaterdepth", "groundwaterlevel",
                   "groundwaterlevelm", "gwlevel", "gwlm", "waterlevelmbgl", "dtwl", "gwl", "waterlevel", "depth"],
    "rainfall_mm": ["rainfallmm", "rainfall", "precipitationmm", "precipitation", "precip", "rainmm", "rain"],
    "temperature_c": ["temperaturec", "temperature", "airtemperature", "meantemperature", "meantemp", "tempc",
                      "temperature2m", "t2m", "temp"],
    "soil_moisture": ["soilmoisture", "volumetricsoilwater", "swvl1", "smap", "sm"],
    "land_cover": ["landcover", "landcoverclass", "lulc", "landuse", "ndvi"],
    "station_type": ["stationtype", "welltype", "sitetype"],
    "well_depth_m": ["welldepthm", "welldepth", "totaldepth"],
}
ODISHA_BOUNDS = (17.5, 22.7, 81.3, 87.6)  # lat_min, lat_max, lon_min, lon_max (sanity check only)


def norm(s):
    return re.sub(r"[^a-z0-9]", "", str(s).lower())


def detect(columns, overrides):
    by_norm = {norm(c): c for c in columns}
    mapping = {}
    for key, aliases in ALIASES.items():
        for a in aliases:
            if a in by_norm:
                mapping[key] = by_norm[a]
                break
    for k, v in overrides.items():
        if v not in columns:
            raise SystemExit(f"Column '{v}' (for {k}) not found. Columns: {list(columns)}")
        mapping[k] = v
    return mapping


def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", str(s).lower()).strip("-")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("file")
    ap.add_argument("--inspect", action="store_true")
    ap.add_argument("--map", action="append", default=[], metavar="field=Column")
    ap.add_argument("--no-state-filter", action="store_true")
    ap.add_argument("--append", action="store_true", help="do not clear existing observations first")
    ap.add_argument("--encoding", default=None)
    args = ap.parse_args()

    df = pd.read_csv(args.file, encoding=args.encoding, low_memory=False)
    overrides = dict(m.split("=", 1) for m in args.map)
    mp = detect(df.columns, overrides)

    print(f"Rows: {len(df)} | Columns: {list(df.columns)}")
    print("Detected mapping:")
    for k in ALIASES:
        print(f"  {k:14s} -> {mp.get(k, '(not found)')}")
    if args.inspect:
        return
    if "depth_mbgl" not in mp:
        raise SystemExit("No groundwater depth column detected. Pass --map depth_mbgl=\"<column>\".")

    out = pd.DataFrame(index=df.index)
    # date
    if "date" in mp:
        raw = df[mp["date"]].astype(str).str.strip()
        out["date"] = pd.to_datetime(raw, errors="coerce", format="ISO8601")  # YYYY-MM-DD first
        if out["date"].isna().mean() > 0.5:  # otherwise assume Indian-style DD-MM-YYYY
            out["date"] = pd.to_datetime(raw, errors="coerce", dayfirst=True)
    elif "year" in mp and "month" in mp:
        m = pd.to_numeric(df[mp["month"]], errors="coerce")
        if m.notna().mean() > 0.9:
            out["date"] = pd.to_datetime(dict(year=pd.to_numeric(df[mp["year"]], errors="coerce"), month=m, day=1), errors="coerce")
        else:
            out["date"] = pd.to_datetime(df[mp["year"]].astype(str) + "-" + df[mp["month"]].astype(str), errors="coerce", format="mixed")
    else:
        raise SystemExit("No date column (or year+month) detected. Pass --map date=<column>.")

    for k in ("station_name", "station_id", "district", "state", "station_type"):
        out[k] = df[mp[k]].astype(str).str.strip() if k in mp else None
    for k in ("latitude", "longitude", "depth_mbgl", "rainfall_mm", "temperature_c", "soil_moisture", "land_cover",
              "well_depth_m"):
        out[k] = pd.to_numeric(df[mp[k]], errors="coerce") if k in mp else np.nan

    # --- Odisha filter ---
    if not args.no_state_filter:
        if "state" not in mp:
            raise SystemExit("No state column found. Use --no-state-filter if the file is already Odisha-only.")
        keep = out["state"].str.lower().str.contains("odisha|orissa", na=False)
        print(f"Odisha rows: {keep.sum()} of {len(out)}")
        out = out[keep]
    if out.empty:
        raise SystemExit("No rows left after filtering.")

    # --- cleaning ---
    n0 = len(out)
    out = out.dropna(subset=["date", "depth_mbgl"])
    out = out[(out["depth_mbgl"] >= 0) & (out["depth_mbgl"] <= 200)]
    print(f"Dropped {n0 - len(out)} rows with missing date/depth or invalid depth")
    if out["temperature_c"].median() > 200:  # Kelvin (e.g. raw ERA5)
        out["temperature_c"] = out["temperature_c"] - 273.15
        print("Temperature looked like Kelvin; converted to °C")
    if out["district"].isna().all() and "district" not in mp:
        print("[warn] no district column; district filters will be empty")
    out["district"] = out["district"].str.title() if out["district"].notna().any() else None

    # --- station identity ---
    if out["station_id"].isna().all():
        base = out["station_name"] if out["station_name"].notna().any() else pd.Series("unknown", index=out.index)
        out["station_id"] = [slug(f"{d}-{n}") for d, n in zip(out["district"].fillna(""), base)]
    if out["station_name"].isna().all():
        out["station_name"] = out["station_id"]

    # --- coordinates: keep only plausible Odisha coordinates; never invent any ---
    la0, la1, lo0, lo1 = ODISHA_BOUNDS
    bad = ~(out["latitude"].between(la0, la1) & out["longitude"].between(lo0, lo1))
    n_bad = int((bad & out["latitude"].notna()).sum())
    if n_bad:
        print(f"[warn] {n_bad} rows had coordinates outside Odisha bounds; coordinates ignored for them")
    out.loc[bad, ["latitude", "longitude"]] = np.nan

    stations = []
    for sid, g in out.groupby("station_id"):
        pick = lambda c: (g[c].dropna().iloc[0] if g[c].notna().any() else None)
        lat, lon, wd = pick("latitude"), pick("longitude"), pick("well_depth_m")
        stations.append({"station_id": sid, "station_name": pick("station_name"), "district": pick("district"),
                         "station_type": pick("station_type"),
                         "well_depth_m": float(wd) if wd is not None else None,
                         "latitude": float(lat) if lat is not None else None,
                         "longitude": float(lon) if lon is not None else None})

    obs_cols = ["station_id", "station_name", "district", "station_type", "date", "depth_mbgl", "rainfall_mm",
                "temperature_c", "soil_moisture", "land_cover"]
    obs = out[obs_cols].astype(object).where(out[obs_cols].notna(), None).to_dict("records")
    for r in obs:
        r["date"] = pd.Timestamp(r["date"]).to_pydatetime()

    ensure_indexes()
    if not args.append:
        db.observations.delete_many({})
        db.stations.delete_many({})
    for s in stations:
        db.stations.update_one({"station_id": s["station_id"]}, {"$set": s}, upsert=True)
    for i in range(0, len(obs), 5000):
        db.observations.insert_many(obs[i:i + 5000])

    with_coords = sum(1 for s in stations if s["latitude"] is not None)
    print(f"Inserted {len(obs)} observations, {len(stations)} stations "
          f"({with_coords} with coordinates), {len({s['district'] for s in stations if s['district']})} districts.")
    print("Environmental coverage:",
          {c: f"{out[c].notna().mean():.0%}" for c in ("rainfall_mm", "temperature_c", "soil_moisture", "land_cover")})


if __name__ == "__main__":
    main()
