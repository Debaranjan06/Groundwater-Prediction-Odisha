import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Download, Loader2, Search } from "lucide-react";
import LocationFilter from "../components/LocationFilter";
import { EmptyState, ErrorState, Loader } from "../components/States";
import { api } from "../lib/api";
import { useFetch } from "../lib/hooks";
import { fmt, fmtDate } from "../lib/utils";

const COLS = [
  { key: "date", label: "Date", sortable: true },
  { key: "station_name", label: "Station", sortable: true },
  { key: "district", label: "District", sortable: true },
  { key: "station_type", label: "Well type", sortable: true },
  { key: "depth_mbgl", label: "Depth (mbgl)", sortable: true, num: true, bold: true },
  { key: "rainfall_mm", label: "Rainfall (mm/day)", sortable: true, num: true },
  { key: "temperature_c", label: "Temp (°C)", sortable: true, num: true },
];
const PAGE = 25;

export default function DataExplorer() {
  const [loc, setLoc] = useState({ district: "", station: "" });
  const [range, setRange] = useState({ start: "", end: "" });
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState({ by: "date", order: "desc" });
  const [page, setPage] = useState(0);
  const [exporting, setExporting] = useState(false);

  useEffect(() => { const t = setTimeout(() => setSearch(q), 350); return () => clearTimeout(t); }, [q]);
  useEffect(() => setPage(0), [loc, range, search, sort]);

  const params = { district: loc.district || undefined, station_id: loc.station || undefined, start: range.start || undefined,
    end: range.end || undefined, search: search || undefined };
  const res = useFetch(() => api.observations({ ...params, sort_by: sort.by, order: sort.order, skip: page * PAGE, limit: PAGE }),
    [loc, range, search, sort, page]);

  const total = res.data?.total || 0;
  const pages = Math.max(1, Math.ceil(total / PAGE));

  async function exportCsv() {
    setExporting(true);
    try {
      const r = await api.exportCsv(params);
      const url = URL.createObjectURL(await r.blob());
      const a = document.createElement("a");
      a.href = url; a.download = "groundwater_observations.csv"; a.click();
      URL.revokeObjectURL(url);
    } catch (e) { alert(e.message); } finally { setExporting(false); }
  }

  const toggle = (key) => setSort((s) => (s.by === key ? { by: key, order: s.order === "asc" ? "desc" : "asc" } : { by: key, order: "asc" }));

  return (
    <div className="space-y-5">
      <div className="card space-y-4 p-5">
        <LocationFilter value={loc} onChange={setLoc} />
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_2fr_auto]">
          <div><label className="label">From</label><input type="date" className="input" value={range.start} onChange={(e) => setRange({ ...range, start: e.target.value })} /></div>
          <div><label className="label">To</label><input type="date" className="input" value={range.end} onChange={(e) => setRange({ ...range, end: e.target.value })} /></div>
          <div>
            <label className="label">Search station name</label>
            <div className="relative"><Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-forest-900/40" />
              <input className="input !pl-10" placeholder="e.g. Cuttack" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          </div>
          <div className="flex items-end">
            <button className="btn-dark w-full" onClick={exportCsv} disabled={exporting || !total}>
              {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}Export CSV
            </button>
          </div>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-forest-900/5 px-5 py-3 text-sm">
          <p><b>{total.toLocaleString("en-IN")}</b> measured records <span className="ml-2 text-xs text-forest-900/50">Soil moisture and land cover are not in this dataset.</span></p>
          <p className="text-xs text-forest-900/55">
            <span className="mr-1 rounded bg-amber-100 px-1.5 py-0.5 font-semibold text-amber-800">missing</span>= value not present in the dataset
          </p>
        </div>
        <div className="min-h-[300px] overflow-x-auto">
          {res.loading ? <Loader /> : res.error ? <ErrorState error={res.error} onRetry={res.reload} /> :
            !res.data?.items.length ? <EmptyState title="No records match these filters" hint="Adjust the district, station or date range, or ingest a dataset first." /> : (
              <table className="w-full text-sm">
                <thead className="bg-forest-900/[.03] text-left text-xs uppercase tracking-wide text-forest-900/55">
                  <tr>{COLS.map((c) => (
                    <th key={c.key} className={`whitespace-nowrap px-4 py-3 font-semibold ${c.num ? "text-right" : ""}`}>
                      <button onClick={() => toggle(c.key)} className="inline-flex items-center gap-1 hover:text-forest-900">
                        {c.label}{sort.by === c.key && (sort.order === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
                      </button>
                    </th>))}</tr>
                </thead>
                <tbody>
                  {res.data.items.map((r, i) => (
                    <tr key={i} className="border-t border-forest-900/5 transition hover:bg-emerald-50/50">
                      {COLS.map((c) => {
                        const v = r[c.key];
                        const missing = v === null || v === undefined || v === "";
                        return (
                          <td key={c.key} className={`whitespace-nowrap px-4 py-2.5 ${c.num ? "text-right tabular-nums" : ""} ${c.bold ? "font-semibold" : ""}`}>
                            {missing ? <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-800">missing</span>
                              : c.key === "date" ? fmtDate(v) : c.key === "station_type" ? (v === "telemetric" ? "Sensor" : "Manual") : c.num ? fmt(v) : v}
                          </td>);
                      })}
                    </tr>))}
                </tbody>
              </table>)}
        </div>
        <div className="flex items-center justify-between border-t border-forest-900/5 px-5 py-3 text-sm">
          <span className="text-xs text-forest-900/55">Page {page + 1} of {pages}</span>
          <div className="flex gap-2">
            <button className="btn-outline !px-3 !py-1.5" disabled={page === 0} onClick={() => setPage(page - 1)}><ChevronLeft className="h-4 w-4" /></button>
            <button className="btn-outline !px-3 !py-1.5" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}><ChevronRight className="h-4 w-4" /></button>
          </div>
        </div>
      </div>
    </div>
  );
}
