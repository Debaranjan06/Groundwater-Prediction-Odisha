"""Extract Odisha from the Kaggle file "India Groundwater Climate Time-Series (1994-2025)".

The Kaggle file has encoded state/district columns (numbers only), so Odisha stations are selected by
point-in-polygon against official 2011 Census district boundaries, which also gives each station its
district name.

Sign convention in the source `target` column:
  * manual dug wells (numeric station ids, ~quarterly)  -> positive = depth below ground (m)
  * telemetric DWLR sensors (alphanumeric ids, daily)  -> negative = below ground (m)
Both are converted to depth_mbgl (positive = below ground). Readings whose sign contradicts the
well's convention are dropped as invalid, not flipped.

  python -m scripts.prepare_kaggle_odisha "Groundwater India Data.csv" data/ODISHA_DISTRICTS.geojson
  -> data/odisha_groundwater.csv   (then: python -m scripts.ingest data/odisha_groundwater.csv --no-state-filter)
"""
import argparse
import json
import os

import numpy as np
import pandas as pd
from shapely.geometry import Point, mapping, shape
from shapely.prepared import prep

TEMP_CANDIDATES = ["t2m", "t  kmnpnn]2m"]  # the Kaggle header for mean 2 m temperature is garbled


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("kaggle_csv")
    ap.add_argument("districts_geojson", help="Odisha district polygons with a 'dtname' property")
    ap.add_argument("--out", default="data/odisha_groundwater.csv")
    ap.add_argument("--map-out", default=None, help="write a simplified GeoJSON for the website map")
    args = ap.parse_args()

    gj = json.load(open(args.districts_geojson))
    districts = [(f["properties"]["dtname"], shape(f["geometry"])) for f in gj["features"]]
    prepared = [(n, prep(g)) for n, g in districts]

    df = pd.read_csv(args.kaggle_csv, low_memory=False)
    temp_col = next((c for c in TEMP_CANDIDATES if c in df.columns), None)
    df["date"] = pd.to_datetime(df["datetime"], errors="coerce")

    st = df.groupby("station_id").agg(lat=("latitude", "first"), lon=("longitude", "first")).reset_index()
    near = st[st.lat.between(17.5, 22.8) & st.lon.between(81.2, 87.7)].copy()

    def which(r):
        pt = Point(r.lon, r.lat)
        return next((n for n, p in prepared if p.contains(pt)), None)

    near["district"] = near.apply(which, axis=1)
    od = near.dropna(subset=["district"])
    print(f"India stations: {len(st)} | Odisha stations (inside district polygons): {len(od)} in {od.district.nunique()} districts")

    x = df[df.station_id.isin(od.station_id)].merge(od[["station_id", "district"]], on="station_id")
    x["station_type"] = np.where(x.station_id.astype(str).str.isdigit(), "manual", "telemetric")
    n0 = len(x)
    manual = x.station_type == "manual"
    valid = (manual & (x.target >= 0)) | (~manual & (x.target <= 0))
    x = x[valid & x.date.notna()].copy()
    x["depth_mbgl"] = x.target.abs()
    x = x[x.depth_mbgl <= 200]
    print(f"Dropped {n0 - len(x)} readings with a sign that contradicts the well type, bad dates or depth > 200 m")

    out = pd.DataFrame({
        "station_id": x.station_id.astype(str),
        "station_name": x.district + " · " + x.station_id.astype(str),
        "station_type": x.station_type,
        "district": x.district,
        "state": "Odisha",
        "latitude": x.latitude,
        "longitude": x.longitude,
        "well_depth_m": x.wellDepth.where(x.wellDepth > 0),
        "date": x.date.dt.date,
        "depth_mbgl": x.depth_mbgl.round(4),
        "rainfall_mm": x.rainfall,
        "temperature_c": x[temp_col] if temp_col else np.nan,
    }).sort_values(["station_id", "date"])
    os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)
    out.to_csv(args.out, index=False)
    by = out.groupby("station_type").agg(stations=("station_id", "nunique"), rows=("depth_mbgl", "size"),
                                         first=("date", "min"), last=("date", "max"))
    print(by.to_string())
    print(f"Wrote {len(out)} rows -> {args.out}")

    if args.map_out:
        feats = [{"type": "Feature", "properties": {"dtname": n},
                  "geometry": mapping(g.simplify(0.004, preserve_topology=True))} for n, g in districts]
        os.makedirs(os.path.dirname(args.map_out) or ".", exist_ok=True)
        with open(args.map_out, "w") as f:
            json.dump({"type": "FeatureCollection", "features": feats}, f, separators=(",", ":"))
        print(f"Wrote simplified district boundaries -> {args.map_out} ({os.path.getsize(args.map_out) // 1024} KB)")


if __name__ == "__main__":
    main()
