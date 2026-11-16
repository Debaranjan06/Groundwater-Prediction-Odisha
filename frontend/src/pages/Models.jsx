import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Trophy } from "lucide-react";
import ChartCard from "../components/ChartCard";
import LocationFilter from "../components/LocationFilter";
import { EmptyState, ErrorState, Loader } from "../components/States";
import { api } from "../lib/api";
import { useFetch } from "../lib/hooks";
import { MODEL_COLORS, WellTypeToggle, chartTheme, fmt, fmtDate } from "../lib/utils";

const axis = { stroke: chartTheme.axis, fontSize: 11, tickLine: false };

export default function Models() {
  const [loc, setLoc] = useState({ district: "", station: "" });
  const [wellType, setWellType] = useState("manual");
  const perf = useFetch(() => api.performance(), []);
  const compare = useFetch(() => api.compareSeries({ district: loc.district || undefined, station_id: loc.station || undefined,
    station_type: wellType || undefined }), [loc, wellType]);
  const rows = perf.data || [];

  if (perf.loading) return <div className="card p-8"><Loader /></div>;
  if (perf.error) return <div className="card p-8"><ErrorState error={perf.error} onRetry={perf.reload} /></div>;
  if (!rows.length)
    return (
      <div className="card p-8">
        <EmptyState title="No trained models yet"
          hint="Ingest the dataset (python -m scripts.ingest <file.csv>) and train the models (python -m ml.train) in the backend folder. Real metrics will appear here afterwards." />
      </div>
    );

  const best = [...rows].sort((a, b) => a.test.rmse - b.test.rmse)[0];
  const base = rows[0].persistence_baseline_test;
  const metric = (key) => rows.map((r) => ({ model: r.model, Train: r.train[key], Test: r.test[key] }));
  const meta = rows[0];
  const types = Object.keys(base?.by_type || {}).filter((t) => base.by_type[t]);
  const TYPE_LABEL = { manual: "Manual wells (about 4 readings a year)", telemetric: "Sensor wells (daily readings)", unknown: "Other wells" };
  const verdicts = types.map((t) => {
    const b = base.by_type[t];
    const top = [...rows].filter((r) => r.test.by_type?.[t]).sort((a, c) => a.test.by_type[t].mae - c.test.by_type[t].mae)[0];
    const m = top?.test.by_type[t];
    return { t, b, top, m, skill: m && b.mae ? 1 - m.mae / b.mae : null };
  });

  return (
    <div className="space-y-6">
      <section className="card flex flex-wrap items-start gap-4 p-5">
        <span className="grid h-11 w-11 place-items-center rounded-xl bg-amber-50 text-amber-600"><Trophy className="h-5 w-5" /></span>
        <div className="min-w-[260px] flex-1">
          <h2 className="text-lg font-semibold">Performance summary</h2>
          <ul className="mt-2 space-y-1.5 text-sm leading-relaxed text-forest-900/75">
            {verdicts.map(({ t, b, top, m, skill }) => (
              <li key={t}>
                <b>{TYPE_LABEL[t] || t}:</b>{" "}
                {skill > 0
                  ? <><b>{top.model}</b> was best, off by {fmt(m.mae)} m on average versus {fmt(b.mae)} m for simply repeating the last reading ({fmt(skill * 100, 0)}% better).</>
                  : <>no model beat simply repeating the last reading ({fmt(b.mae)} m average error); the closest was {top.model} at {fmt(m.mae)} m. Day-to-day changes are small, so the last reading is already a strong forecast.</>}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs leading-relaxed text-forest-900/50">
            Each well type is split in time: the latest 20% of its readings
            {meta.cutoff_by_type ? <> ({Object.entries(meta.cutoff_by_type).map(([t, c]) => `${t === "telemetric" ? "sensor" : t} wells after ${fmtDate(c)}`).join("; ")})</> : <> (after {fmtDate(meta.cutoff_date)})</>}
            {" "}are kept for testing and never seen in training. R² is high for every model, including the baseline, because wells
            differ a lot in depth; the comparison with repeating the last reading is the fairer test. {meta.n_stations} wells · input of the last {meta.window} readings ·
            the models predict the change from the last reading · trained {fmtDate(meta.trained_at)}.
          </p>
        </div>
      </section>

      {types.length > 0 && (
        <section className="card overflow-x-auto p-5">
          <h3 className="text-lg font-semibold">Test error by well type</h3>
          <p className="mt-0.5 text-xs text-forest-900/55">Mean absolute error in metres (lower is better). Green marks a model that beats repeating the last reading.</p>
          <table className="mt-3 w-full min-w-[560px] text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-forest-900/55">
              <tr><th className="pb-2">Model</th>{types.map((t) => <th key={t} className="text-right">{t === "telemetric" ? "Sensor wells" : t === "manual" ? "Manual wells" : t}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.model} className="border-t border-forest-900/5">
                  <td className="py-2.5 font-semibold"><span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ background: MODEL_COLORS[r.model] }} />{r.model}</td>
                  {types.map((t) => {
                    const m = r.test.by_type?.[t];
                    const better = m && m.mae < base.by_type[t].mae;
                    return <td key={t} className={`text-right tabular-nums ${better ? "font-semibold text-emerald-700" : ""}`}>{m ? fmt(m.mae, 3) : "—"}</td>;
                  })}
                </tr>))}
              <tr className="border-t border-forest-900/5 text-forest-900/55">
                <td className="py-2.5 italic">Baseline: repeat last reading</td>
                {types.map((t) => <td key={t} className="text-right tabular-nums">{fmt(base.by_type[t].mae, 3)}</td>)}
              </tr>
              <tr className="text-xs text-forest-900/45">
                <td className="pb-1">Test readings</td>{types.map((t) => <td key={t} className="text-right">{base.by_type[t].n.toLocaleString("en-IN")}</td>)}
              </tr>
              {meta.cutoff_by_type && (
                <tr className="text-xs text-forest-900/45">
                  <td className="pb-1">Test period starts</td>{types.map((t) => <td key={t} className="text-right">{fmtDate(meta.cutoff_by_type[t])}</td>)}
                </tr>)}
            </tbody>
          </table>
        </section>
      )}

      <section className="card overflow-x-auto p-5">
        <h3 className="text-lg font-semibold">Training and testing performance (all wells)</h3>
        <table className="mt-3 w-full min-w-[640px] text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-forest-900/55">
            <tr><th className="pb-2">Model</th><th className="text-right">Train MAE</th><th className="text-right">Train RMSE</th><th className="text-right">Train R²</th>
              <th className="text-right">Test MAE</th><th className="text-right">Test RMSE</th><th className="text-right">Test R²</th><th className="text-right">Test n</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.model} className={`border-t border-forest-900/5 ${r.model === best.model ? "bg-emerald-50/60" : ""}`}>
                <td className="py-2.5 font-semibold"><span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ background: MODEL_COLORS[r.model] }} />{r.model}
                  {r.model === best.model && <span className="ml-2 rounded bg-emerald-600 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">best</span>}</td>
                {[r.train.mae, r.train.rmse, r.train.r2, r.test.mae, r.test.rmse, r.test.r2].map((v, i) => <td key={i} className="text-right tabular-nums">{fmt(v, 3)}</td>)}
                <td className="text-right tabular-nums text-forest-900/55">{r.test.n}</td>
              </tr>))}
            {base && (
              <tr className="border-t border-forest-900/5 text-forest-900/55">
                <td className="py-2.5 italic">Baseline: repeat last value</td><td colSpan={3} />
                <td className="text-right tabular-nums">{fmt(base.mae, 3)}</td><td className="text-right tabular-nums">{fmt(base.rmse, 3)}</td><td className="text-right tabular-nums">{fmt(base.r2, 3)}</td><td className="text-right">{base.n}</td>
              </tr>)}
          </tbody>
        </table>
        <p className="mt-3 text-xs text-forest-900/50">MAE and RMSE in metres. Train metrics use the earlier period; test metrics use only later, unseen observations.
          The overall figures are dominated by the many daily sensor readings, so use the per-well-type table above for conclusions.</p>
      </section>

      <div className="grid gap-5 lg:grid-cols-3">
        {[["mae", "Mean Absolute Error (m)"], ["rmse", "Root Mean Squared Error (m)"], ["r2", "R² score"]].map(([k, t]) => (
          <ChartCard key={k} title={t} subtitle="Lower is better except R²" res={{ data: metric(k) }} height={260}>
            {(d) => (
              <ResponsiveContainer>
                <BarChart data={d} margin={{ left: 0, right: 8, top: 8 }}>
                  <CartesianGrid stroke={chartTheme.grid} vertical={false} />
                  <XAxis dataKey="model" {...axis} interval={0} minTickGap={0} tickFormatter={(m) => m.replace("Linear Regression", "Linear").replace("Random Forest", "RF").replace("Gradient Boosting", "GB").replace("MLP Neural Network", "MLP")} />
                  <YAxis {...axis} width={40} />
                  <Tooltip contentStyle={chartTheme.tooltip} formatter={(v) => fmt(v, 3)} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="Train" fill="#7fd6f7" radius={[5, 5, 0, 0]} />
                  <Bar dataKey="Test" fill="#059669" radius={[5, 5, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>)}
          </ChartCard>))}
      </div>

      <div className="card space-y-4 p-5">
        <LocationFilter value={loc} onChange={setLoc} />
        <WellTypeToggle value={wellType} onChange={setWellType} />
      </div>
      <ChartCard title="Actual vs predicted — all models (test period)" res={compare} height={380}
        subtitle={loc.station ? "Single station, observation by observation" : "Monthly mean across the selected stations; predicted values are model estimates"}
        emptyTitle="No test predictions for this selection">
        {(d) => (
          <ResponsiveContainer>
            <LineChart data={d} margin={{ left: 0, right: 12, top: 8 }}>
              <CartesianGrid stroke={chartTheme.grid} vertical={false} />
              <XAxis dataKey="period" {...axis} minTickGap={40} />
              <YAxis reversed {...axis} width={40} label={{ value: "mbgl", angle: -90, position: "insideLeft", fontSize: 11, fill: chartTheme.axis }} />
              <Tooltip contentStyle={chartTheme.tooltip} formatter={(v, n) => [`${fmt(v)} mbgl`, n]} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line name="Actual (measured)" dataKey="actual" stroke={chartTheme.ink} strokeWidth={2.6} dot={false} connectNulls />
              {rows.map((r) => <Line key={r.model} name={`${r.model}`} dataKey={r.model} stroke={MODEL_COLORS[r.model]} strokeWidth={1.8} strokeDasharray="5 4" dot={false} connectNulls />)}
            </LineChart>
          </ResponsiveContainer>)}
      </ChartCard>
    </div>
  );
}
