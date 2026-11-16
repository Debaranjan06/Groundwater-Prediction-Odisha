import { useEffect, useMemo, useState } from "react";
import { CircleMarker, GeoJSON, MapContainer, Popup, TileLayer, useMap } from "react-leaflet";
import { Info, MapPinOff } from "lucide-react";
import LocationFilter from "../components/LocationFilter";
import { ErrorState, Loader } from "../components/States";
import { api } from "../lib/api";
import { useFetch } from "../lib/hooks";
import { DEPTH_CATEGORIES, categoryOf, fmt, fmtDate } from "../lib/utils";

const ODISHA_CENTER = [20.5, 84.4];
const NAME_KEYS = ["district", "DISTRICT", "District", "dtname", "DTNAME", "NAME_2", "name", "NAME", "Dist_Name"];

function FitTo({ points }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 1) map.setView(points[0], 10);
    else if (points.length > 1) map.fitBounds(points, { padding: [40, 40], maxZoom: 11 });
  }, [points, map]);
  return null;
}

export default function MapPage() {
  const [loc, setLoc] = useState({ district: "", station: "" });
  const [boundaries, setBoundaries] = useState(null);
  const stations = useFetch(() => api.stations(loc.district), [loc.district]);

  useEffect(() => {
    fetch("/odisha_districts.geojson")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => (j?.features ? setBoundaries(j) : null))
      .catch(() => {});
  }, []);

  const all = stations.data || [];
  const shown = loc.station ? all.filter((s) => s.station_id === loc.station) : all;
  const mapped = shown.filter((s) => s.latitude != null && s.longitude != null);
  const points = useMemo(() => mapped.map((s) => [s.latitude, s.longitude]), [shown]); // eslint-disable-line

  const nameOf = (f) => { const k = NAME_KEYS.find((k) => f.properties?.[k]); return k ? String(f.properties[k]) : ""; };
  const style = (f) => {
    const sel = loc.district && nameOf(f).toLowerCase() === loc.district.toLowerCase();
    return { color: sel ? "#059669" : "var(--chart-ink)", weight: sel ? 2.5 : 1, fillColor: "#10b981", fillOpacity: sel ? 0.18 : 0.03 };
  };
  const onEach = (f, layer) => {
    layer.bindTooltip(nameOf(f), { sticky: true });
    layer.on("click", () => setLoc({ district: nameOf(f), station: "" }));
  };

  return (
    <div className="space-y-5">
      <div className="card p-5"><LocationFilter value={loc} onChange={setLoc} /></div>

      <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
        <div className="card relative overflow-hidden p-2">
          {stations.loading && <div className="absolute inset-0 z-[500] grid place-items-center bg-white/70"><Loader label="Loading stations…" /></div>}
          {stations.error ? <div className="h-[560px]"><ErrorState error={stations.error} onRetry={stations.reload} /></div> : (
            <MapContainer center={ODISHA_CENTER} zoom={7} scrollWheelZoom className="h-[560px] w-full">
              <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              {boundaries && <GeoJSON key={loc.district || "all"} data={boundaries} style={style} onEachFeature={onEach} />}
              <FitTo points={points} />
              {mapped.map((s) => {
                const cat = categoryOf(s.latest_depth);
                return (
                  <CircleMarker key={s.station_id} center={[s.latitude, s.longitude]} radius={s.station_type === "telemetric" ? 8 : 6}
                    pathOptions={{ color: s.station_type === "telemetric" ? "#062a20" : "#fff", weight: s.station_type === "telemetric" ? 2.5 : 1.5,
                      fillColor: cat?.color || "#94a3b8", fillOpacity: 0.95 }}
                    eventHandlers={{ click: () => setLoc((l) => ({ ...l, station: s.station_id })) }}>
                    <Popup>
                      <div className="min-w-[190px] text-sm">
                        <p className="font-semibold">{s.station_name}</p>
                        <p className="text-xs text-slate-500">{s.district || "District n/a"} · {s.station_type === "telemetric" ? "sensor well (daily)" : "manual well (quarterly)"}
                          {s.well_depth_m != null && ` · ${fmt(s.well_depth_m, 1)} m deep`}</p>
                        <p className="mt-2 text-xs text-slate-500">Latest measured depth</p>
                        <p className="text-lg font-semibold">{s.latest_depth != null ? `${fmt(s.latest_depth)} mbgl` : "—"}</p>
                        <p className="text-xs text-slate-500">{fmtDate(s.latest_date)} · {s.obs_count} observations</p>
                        {cat && <p className="mt-1 text-xs font-semibold" style={{ color: cat.color }}>{cat.note} ({cat.key})</p>}
                        <p className="mt-1 text-[11px] text-slate-400">{fmt(s.latitude, 4)}, {fmt(s.longitude, 4)}</p>
                      </div>
                    </Popup>
                  </CircleMarker>
                );
              })}
            </MapContainer>
          )}
        </div>

        <aside className="space-y-4">
          <div className="card p-4">
            <h3 className="font-semibold">Latest measured depth</h3>
            <p className="text-xs text-forest-900/50">Each well's own last reading; older wells may have stopped reporting.</p>
            <ul className="mt-3 space-y-2">
              {DEPTH_CATEGORIES.map((c) => (
                <li key={c.key} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2"><span className="h-3 w-3 rounded-full" style={{ background: c.color }} />{c.key}</span>
                  <span className="text-xs text-forest-900/55">{mapped.filter((s) => categoryOf(s.latest_depth)?.key === c.key).length} stations</span>
                </li>
              ))}
              <li className="flex items-center gap-2 text-sm"><span className="h-3 w-3 rounded-full bg-slate-400" />No measurement</li>
              <li className="flex items-center gap-2 border-t border-forest-900/5 pt-2 text-sm"><span className="h-3.5 w-3.5 rounded-full border-[2.5px] border-forest-900 bg-[#fff] dark:border-[#062a20]" />Sensor well (daily)</li>
              <li className="flex items-center gap-2 text-sm"><span className="h-3 w-3 rounded-full border border-slate-300 bg-[#fff]" />Manual well (quarterly)</li>
            </ul>
          </div>
          <div className="card space-y-2 p-4 text-sm">
            <p><b>{mapped.length}</b> of <b>{shown.length}</b> stations have coordinates in the dataset.</p>
            {shown.length - mapped.length > 0 && (
              <p className="flex items-start gap-2 text-xs text-forest-900/60"><MapPinOff className="mt-0.5 h-4 w-4 shrink-0" />
                Stations without coordinates are not plotted; no locations are estimated.</p>
            )}
          </div>
          {!boundaries && (
            <div className="card flex gap-2 p-4 text-xs leading-relaxed text-forest-900/65">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-aqua-600" />
              <p>District boundary layer not loaded. Place an Odisha districts GeoJSON at <code className="rounded bg-forest-900/5 px-1">frontend/public/odisha_districts.geojson</code> to show boundaries and click-to-select.</p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
