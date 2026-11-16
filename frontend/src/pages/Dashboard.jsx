import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Area, Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line, LineChart, ResponsiveContainer,
  Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis,
} from "recharts";
import { Activity, Droplet, MapPin, Radio, Sparkles, Trophy, TrendingDown, TrendingUp } from "lucide-react";
import ChartCard from "../components/ChartCard";
import LocationFilter from "../components/LocationFilter";
import StatCard from "../components/StatCard";
import { api } from "../lib/api";
import { useFetch } from "../lib/hooks";
import { MODEL_COLORS, MONTHS, WellTypeToggle, chartTheme, fmt, fmtDate } from "../lib/utils";

const axis = { stroke: chartTheme.axis, fontSize: 11, tickLine: false };

// CGWB reads manual wells in four rounds a year; plotting each round as its own line shows the long-term
// change without the seasonal zigzag.
const SEASONS = [
  { key: "pre", label: "Pre-monsoon (Mar–May)", months: [3, 4, 5], color: "#dc6b19" },
  { key: "mon", label: "Monsoon (Jun–Sep)", months: [6, 7, 8, 9], color: "#0e7fb0" },
  { key: "post", label: "Post-monsoon (Oct–Dec)", months: [10, 11, 12], color: "#059669" },
  { key: "jan", label: "January (Jan–Feb)", months: [1, 2], color: "#7c5cbf" },
];

function bySeason(rows) {
  if (!rows?.length || rows.length > 400) return null;
  const perMonth = {};
  rows.forEach((r) => { const m = Number(r.period.slice(5, 7)); perMonth[m] = (perMonth[m] || 0) + (r.n || 1); });
  const counts = Object.values(perMonth).sort((a, b) => b - a);
  const total = counts.reduce((a, b) => a + b, 0);
  const top4 = counts.slice(0, 4).reduce((a, b) => a + b, 0);
  const span = Number(rows.at(-1).period.slice(0, 4)) - Number(rows[0].period.slice(0, 4));
  if (top4 / total < 0.9 || span < 4) return null; // daily/monthly data keeps the plain monthly line
  const acc = {};
  for (const r of rows) {
    if (r.depth == null) continue;
    const y = r.period.slice(0, 4);
    const s = SEASONS.find((x) => x.months.includes(Number(r.period.slice(5, 7))));
    acc[y] ??= { year: y };
    const cell = (acc[y][`_${s.key}`] ??= { sum: 0, w: 0 });
    cell.sum += r.depth * (r.n || 1); cell.w += r.n || 1;
  }
  return Object.values(acc).sort((a, b) => a.year.localeCompare(b.year)).map((o) => {
    const out = { year: o.year };
    for (const s of SEASONS) if (o[`_${s.key}`]) out[s.key] = o[`_${s.key}`].sum / o[`_${s.key}`].w;
    return out;
  });
}

export default function Dashboard() {
  const [loc, setLoc] = useState({ district: "", station: "" });
  const [model, setModel] = useState("");
  const [wellType, setWellType] = useState("manual");
  const p = { district: loc.district || undefined, station_id: loc.station || undefined, station_type: wellType || undefined };
  const dep = [loc.district, loc.station, wellType];

  const stats = useFetch(() => api.stats(p), dep);
  const series = useFetch(() => api.series(p), dep);
  const seasonal = useFetch(() => api.seasonal(p), dep);
  const rain = useFetch(() => api.rainfall(p), dep);
  const districts = useFetch(() => api.districtComparison({ station_type: wellType || undefined }), [wellType]);
  const perf = useFetch(() => api.performance(), []);
  const compare = useFetch(() => api.compareSeries(p), dep);

  const s = stats.data;
  const trend = s?.trend;
  const TrendIcon = trend?.slope_m_per_year > 0.05 ? TrendingDown : TrendingUp;
  const models = perf.data?.map((m) => m.model) || [];
  const activeModel = model || models[0];
  const pred = s?.latest_prediction;

  return (
    <div className="space-y-6">
      <div className="card space-y-4 p-5">
        <LocationFilter value={loc} onChange={setLoc} />
        <div className="flex flex-wrap items-center gap-3">
          <WellTypeToggle value={wellType} onChange={setWellType} />
          <p className="text-xs text-forest-900/55">
            {loc.station ? "A single station is selected, so the well-type filter is ignored." :
              wellType === "manual" ? "Manual wells have the long 1994–2025 record, read about 4 times a year." :
              wellType === "telemetric" ? "Sensor wells give daily readings from 2023 onwards." :
              "All wells mixed: averages shift when wells start or stop reporting."}
          </p>
        </div>
      </div>

      {stats.error && <div className="card p-4"><p className="text-sm text-amber-700">{stats.error.message}</p></div>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <StatCard icon={Radio} label="Monitoring stations" loading={stats.loading} value={s?.total_stations?.toLocaleString("en-IN") ?? "—"}
          sub={s && s.selected_stations !== s.total_stations ? `${s.selected_stations} in current selection` : "In the CGWB dataset"} />
        <StatCard icon={MapPin} tone="aqua" label="Districts selected" loading={stats.loading} value={s?.selected_districts ?? "—"}
          sub={loc.district || "All districts with data"} />
        <StatCard icon={Droplet} tone="forest" label="Latest observed depth" loading={stats.loading}
          value={s?.latest_observed ? fmt(s.latest_observed.value) : "—"} unit={s?.latest_observed ? "mbgl" : ""}
          sub={s?.latest_observed ? `Measured · up to ${fmtDate(s.latest_observed.date)}${s.latest_observed.stations > 1 ? ` · median of ${s.latest_observed.stations} wells reporting in the last 12 months` : ""}` : "No observations"} />
        <StatCard icon={Sparkles} tone="amber" label="Predicted depth" loading={stats.loading}
          value={pred ? fmt(pred.predictions.at(-1).depth_mbgl) : "—"} unit={pred ? "mbgl" : ""}
          sub={pred ? `Estimate · ${pred.model} · ${pred.station_name}` : <>No saved prediction yet. <Link to="/predict" className="font-semibold text-emerald-700 underline">Run one</Link></>} />
        <StatCard icon={Activity} tone={trend?.slope_m_per_year > 0.05 ? "amber" : "emerald"} label="Groundwater trend" loading={stats.loading}
          value={trend?.slope_m_per_year != null ? <span className="inline-flex items-center gap-1.5"><TrendIcon className="h-5 w-5" />{fmt(Math.abs(trend.slope_m_per_year))}</span> : "—"}
          unit={trend?.slope_m_per_year != null ? "m/yr" : ""}
          sub={trend?.slope_m_per_year != null ? `${trend.label} · median of ${trend.stations} wells with 3+ years of data (${trend.deepening} deepening)` : trend?.label} />
        <StatCard icon={Trophy} label="Best model (test RMSE)" loading={stats.loading || perf.loading}
          value={s?.best_model?.model ?? "—"}
          sub={s?.best_model ? `RMSE ${fmt(s.best_model.rmse)} · MAE ${fmt(s.best_model.mae)} · R² ${fmt(s.best_model.r2)}` : "Train the models to see results"} />
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <ChartCard title="Historical groundwater depth" res={series}
          subtitle={bySeason(series.data)
            ? "Measured values by season and year (CGWB reading rounds) · mean of wells read · deeper water plotted lower (mbgl)"
            : loc.station ? "Measured values · deeper water plotted lower (mbgl)" : "Measured values, mean of the wells read in each month · deeper water plotted lower (mbgl)"}>
          {(d) => bySeason(d) ? (
            <ResponsiveContainer>
              <LineChart data={bySeason(d)} margin={{ left: 0, right: 12, top: 8 }}>
                <CartesianGrid stroke={chartTheme.grid} vertical={false} />
                <XAxis dataKey="year" {...axis} minTickGap={24} />
                <YAxis reversed {...axis} width={40} label={{ value: "mbgl", angle: -90, position: "insideLeft", fontSize: 11, fill: chartTheme.axis }} />
                <Tooltip contentStyle={chartTheme.tooltip} formatter={(v, n) => [`${fmt(v)} mbgl`, n]} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {SEASONS.map((s) => <Line key={s.key} name={s.label} dataKey={s.key} stroke={s.color} strokeWidth={2} dot={{ r: 2 }} connectNulls />)}
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <ResponsiveContainer>
              <LineChart data={d} margin={{ left: 0, right: 12, top: 8 }}>
                <CartesianGrid stroke={chartTheme.grid} vertical={false} />
                <XAxis dataKey="period" {...axis} minTickGap={40} />
                <YAxis reversed {...axis} width={40} label={{ value: "mbgl", angle: -90, position: "insideLeft", fontSize: 11, fill: chartTheme.axis }} />
                <Tooltip contentStyle={chartTheme.tooltip}
                  formatter={(v, n, ctx) => [`${fmt(v)} mbgl${ctx.payload.stations > 1 ? ` (${ctx.payload.stations} wells)` : ""}`, "Measured depth"]} />
                <Line dataKey="depth" stroke="#059669" strokeWidth={2.2} dot={false} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Actual vs predicted (test period)" res={compare}
          subtitle="Held-out future observations only · predicted values are model estimates"
          emptyTitle="No test-set results yet" emptyHint="Run python -m ml.train in the backend to train the models."
          action={models.length > 0 && (
            <select className="input !w-auto !py-1.5 text-xs" value={activeModel} onChange={(e) => setModel(e.target.value)}>
              {models.map((m) => <option key={m}>{m}</option>)}
            </select>
          )}>
          {(d) => (
            <ResponsiveContainer>
              <LineChart data={d} margin={{ left: 0, right: 12, top: 8 }}>
                <CartesianGrid stroke={chartTheme.grid} vertical={false} />
                <XAxis dataKey="period" {...axis} minTickGap={40} />
                <YAxis reversed {...axis} width={40} />
                <Tooltip contentStyle={chartTheme.tooltip} formatter={(v, n) => [`${fmt(v)} mbgl`, n]} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line name="Actual (measured)" dataKey="actual" stroke={chartTheme.ink} strokeWidth={2} dot={false} connectNulls />
                <Line name={`${activeModel} (predicted)`} dataKey={activeModel} stroke={MODEL_COLORS[activeModel] || "#16a0d8"} strokeWidth={2} strokeDasharray="5 4" dot={false} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Rainfall vs groundwater depth" res={rain} isEmpty={(d) => !d?.points?.length}
          emptyTitle="No rainfall data for this selection"
          subtitle={rain.data?.pearson_r != null ? `Monthly means · Pearson r = ${fmt(rain.data.pearson_r)} (association, not causation)` : "Monthly means"}>
          {(d) => (
            <ResponsiveContainer>
              <ScatterChart margin={{ left: 0, right: 12, top: 8, bottom: 8 }}>
                <CartesianGrid stroke={chartTheme.grid} />
                <XAxis type="number" dataKey="rainfall" name="Rainfall" {...axis} label={{ value: "Rainfall on reading days (mm/day)", position: "insideBottom", offset: -4, fontSize: 11, fill: chartTheme.axis }} />
                <YAxis type="number" dataKey="depth" name="Depth" reversed {...axis} width={40} />
                <ZAxis range={[40, 40]} />
                <Tooltip contentStyle={chartTheme.tooltip} cursor={{ strokeDasharray: "3 3" }}
                  formatter={(v, n) => [fmt(v), n === "Depth" ? "Depth (mbgl)" : n]} labelFormatter={() => ""} />
                <Scatter data={d.points} fill="#0e7fb0" fillOpacity={0.6} />
              </ScatterChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="District-wise comparison" subtitle="Mean measured depth over all records (mbgl)" res={districts} height={Math.max(300, (districts.data?.length || 0) * 26)}>
          {(d) => (
            <ResponsiveContainer>
              <BarChart data={d} layout="vertical" margin={{ left: 16, right: 16 }}>
                <CartesianGrid stroke={chartTheme.grid} horizontal={false} />
                <XAxis type="number" {...axis} />
                <YAxis type="category" dataKey="district" {...axis} width={90} interval={0} />
                <Tooltip contentStyle={chartTheme.tooltip}
                  formatter={(v, n, ctx) => [`${fmt(v)} mbgl (range ${fmt(ctx.payload.min)}–${fmt(ctx.payload.max)}, ${ctx.payload.stations} stations)`, "Mean depth"]} />
                <Bar dataKey="mean" fill="#10b981" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard className="xl:col-span-2" title="Seasonal pattern by calendar month"
          subtitle="Months shown only where observations exist, so the pattern matches the dataset's real observation frequency" res={seasonal}>
          {(d) => (
            <ResponsiveContainer>
              <ComposedChart data={d.map((r) => ({ ...r, name: MONTHS[r.month - 1] }))} margin={{ left: 0, right: 8, top: 8 }}>
                <CartesianGrid stroke={chartTheme.grid} vertical={false} />
                <XAxis dataKey="name" {...axis} />
                <YAxis yAxisId="d" reversed {...axis} width={40} />
                <YAxis yAxisId="r" orientation="right" {...axis} width={40} />
                <Tooltip contentStyle={chartTheme.tooltip} formatter={(v, n) => [fmt(v), n]} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar yAxisId="r" name="Rainfall on reading days (mm/day)" dataKey="rainfall" fill="#7fd6f7" radius={[6, 6, 0, 0]} />
                <Line yAxisId="d" name="Mean depth (mbgl)" dataKey="depth" stroke="#059669" strokeWidth={2.4} dot={{ r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>
    </div>
  );
}
