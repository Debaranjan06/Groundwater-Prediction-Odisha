import { useEffect } from "react";
import { api } from "../lib/api";
import { useFetch } from "../lib/hooks";

/** District + station dropdowns backed by real database content. value = { district, station } */
export default function LocationFilter({ value, onChange, requireStation = false, className = "" }) {
  const districts = useFetch(() => api.districts(), []);
  const stations = useFetch(() => api.stations(value.district), [value.district]);

  // when a station is required, auto-select the first one
  useEffect(() => {
    if (requireStation && stations.data?.length && !stations.data.some((s) => s.station_id === value.station)) {
      onChange({ ...value, station: stations.data[0].station_id });
    }
    // eslint-disable-next-line
  }, [stations.data, requireStation]);

  return (
    <div className={`grid gap-3 sm:grid-cols-2 ${className}`}>
      <div>
        <label className="label">District</label>
        <select className="input" value={value.district}
          onChange={(e) => onChange({ district: e.target.value, station: "" })}>
          {!requireStation && <option value="">All districts</option>}
          {requireStation && !value.district && <option value="">All districts</option>}
          {(districts.data || []).map((d) => (
            <option key={d.district} value={d.district}>{d.district} ({d.stations})</option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">Monitoring station</label>
        <select className="input" value={value.station}
          onChange={(e) => onChange({ ...value, station: e.target.value })}>
          {!requireStation && <option value="">All stations</option>}
          {(stations.data || []).map((s) => (
            <option key={s.station_id} value={s.station_id}>
              {s.station_name}{s.station_type ? ` · ${s.station_type === "telemetric" ? "sensor, daily" : "manual, quarterly"}` : ""}
            </option>
          ))}
        </select>
      </div>
      {(districts.error || stations.error) && (
        <p className="text-xs text-amber-700 sm:col-span-2">{(districts.error || stations.error).message}</p>
      )}
    </div>
  );
}
