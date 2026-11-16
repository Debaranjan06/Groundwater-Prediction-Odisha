import { useState } from "react";
import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertCircle, CheckCircle2, Info, Loader2, MinusCircle, Play } from "lucide-react";
import LocationFilter from "../components/LocationFilter";
import { ErrorState, Loader } from "../components/States";
import { api } from "../lib/api";
import { useFetch } from "../lib/hooks";
import { MODELS, MODEL_COLORS, categoryOf, chartTheme, fmt, fmtDate } from "../lib/utils";

const MODEL_INFO = {
  "Linear Regression": "Linear baseline fitted to the flattened recent window.",
  "Random Forest": "Ensemble of decision trees fitted to the flattened recent window.",
  "Gradient Boosting": "Trees built one after another, each correcting the errors of the previous ones.",
  "MLP Neural Network": "Small feed-forward neural network (two hidden layers) that trains in seconds on a normal CPU.",
  LSTM: "Recurrent network that reads the recent readings in order; trained on CPU with TensorFlow.",
};

export default function Predict() {
  const [loc, setLoc] = useState({ district: "", station: "" });
  const [model, setModel] = useState("Random Forest");
  const [steps, setSteps] = useState(1);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const perf = useFetch(() => api.performance(), []);
  const trained = perf.data?.length ? MODELS.filter((m) => perf.data.some((p) => p.model === m)) : MODELS.filter((m) => m !== "LSTM");

  const station = useFetch(() => api.station(loc.station), [loc.station], { enabled: !!loc.station });
  const env = useFetch(() => api.environment({ station_id: loc.station }), [loc.station], { enabled: !!loc.station });
  const st = station.data;

  async function run() {
    setRunning(true); setError(null);
    try { setResult(await api.predict({ station_id: loc.station, model, steps })); }
    catch (e) { setError(e); setResult(null); }
    finally { setRunning(false); }
  }

  const onLoc = (v) => { setLoc(v); setResult(null); setError(null); };
  const chartData = result ? [
    ...result.history.map((h) => ({ date: h.date, measured: h.depth_mbgl })),
    { date: result.last_observed.date, measured: result.last_observed.depth_mbgl, predicted: result.last_observed.depth_mbgl, join: true },
    ...result.predictions.map((p) => ({ date: p.date, predicted: p.depth_mbgl })),
  ].filter((d, i, a) => a.findIndex((x) => x.date === d.date && !!x.join === !!d.join && x.measured === d.measured && x.predicted === d.predicted) === i) : [];

  return (
    <div className="grid gap-6 xl:grid-cols-[400px_1fr]">
      <div className="space-y-5">
        <section className="card space-y-4 p-5">
          <h2 className="text-lg font-semibold">1 · Location</h2>
          <LocationFilter value={loc} onChange={onLoc} requireStation className="!grid-cols-1" />

          {station.loading && loc.station ? <Loader /> : st && (
            <div className="rounded-xl bg-forest-900/[.04] p-3.5 text-sm">
              <p className="font-semibold">{st.station_name}</p>
              <dl className="mt-2 grid grid-cols-2 gap-y-1.5 text-xs text-forest-900/70">
                <dt>Well type</dt><dd className="text-right font-medium text-forest-900">{st.station_type === "telemetric" ? "Sensor (automatic)" : st.station_type === "manual" ? "Manual dug well" : "—"}</dd>
                <dt>Well depth</dt><dd className="text-right font-medium text-forest-900">{st.well_depth_m != null ? `${fmt(st.well_depth_m, 1)} m` : "not in dataset"}</dd>
                <dt>Observations</dt><dd className="text-right font-medium text-forest-900">{st.obs_count}</dd>
                <dt>Record span</dt><dd className="text-right font-medium text-forest-900">{fmtDate(st.first_date)} – {fmtDate(st.last_date)}</dd>
                <dt>Observation frequency</dt><dd className="text-right font-medium text-forest-900">{st.frequency}</dd>
                <dt>Coordinates</dt><dd className="text-right font-medium text-forest-900">{st.latitude != null ? `${fmt(st.latitude, 4)}, ${fmt(st.longitude, 4)}` : "not in dataset"}</dd>
              </dl>
            </div>
          )}
        </section>

        <section className="card space-y-3 p-5">
          <h2 className="text-lg font-semibold">2 · Environmental data available</h2>
          {env.loading ? <Loader /> : env.error ? <ErrorState error={env.error} onRetry={env.reload} /> : (
            <ul className="space-y-2">
              {(env.data?.availability || []).map((a) => {
                const has = a.count > 0;
                const latest = env.data.latest[a.key];
                const Icon = has ? CheckCircle2 : MinusCircle;
                return (
                  <li key={a.key} className="flex items-center justify-between gap-3 text-sm">
                    <span className="flex items-center gap-2"><Icon className={`h-4 w-4 ${has ? "text-emerald-600" : "text-forest-900/25"}`} />{a.label}</span>
                    <span className="text-right text-xs text-forest-900/60">
                      {has ? <>{a.count}/{a.total} records{latest && <> · latest <b className="text-forest-900">{fmt(latest.value)}</b></>}</> : "not in dataset"}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="text-xs text-forest-900/50">Future environmental conditions are unknown, so forecasts use this station's own monthly averages for those inputs.</p>
        </section>

        <section className="card space-y-4 p-5">
          <h2 className="text-lg font-semibold">3 · Model & period</h2>
          <div className="grid grid-cols-2 gap-2">
            {trained.map((m) => (
              <button key={m} onClick={() => setModel(m)}
                className={`rounded-xl px-3 py-2.5 text-left text-sm font-semibold ring-1 transition ${model === m ? "bg-forest-800 text-white ring-forest-800" : "bg-white ring-forest-900/15 hover:ring-emerald-500 dark:bg-forest-800/50 dark:ring-white/15"}`}>
                <span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ background: MODEL_COLORS[m] }} />{m}
              </button>
            ))}
          </div>
          <p className="text-xs text-forest-900/55">{MODEL_INFO[model]}</p>
          <div>
            <label className="label">Prediction period</label>
            <select className="input" value={steps} onChange={(e) => setSteps(Number(e.target.value))}>
              {[1, 2, 3, 4].map((n) => (
                <option key={n} value={n}>{n === 1 ? "Next observation" : `Next ${n} observations`}{st?.frequency ? ` (${st.frequency} data)` : ""}</option>
              ))}
            </select>
            <p className="mt-1.5 text-xs text-forest-900/50">Steps follow this station's own observation interval; finer-than-observed predictions are not offered.</p>
          </div>
          <button className="btn-primary w-full !py-3" onClick={run} disabled={!loc.station || running}>
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Run prediction
          </button>
        </section>
      </div>

      <section className="card min-h-[420px] p-6">
        {running ? <Loader label="Running trained model…" /> : error ? (
          <div className="flex h-full min-h-[300px] flex-col items-center justify-center text-center">
            <AlertCircle className="h-7 w-7 text-amber-600" />
            <p className="mt-2 max-w-md text-sm text-forest-900/75">{error.message}</p>
          </div>
        ) : !result ? (
          <div className="flex h-full min-h-[300px] flex-col items-center justify-center text-center text-forest-900/50">
            <Info className="h-7 w-7" />
            <p className="mt-2 text-sm font-semibold">No prediction yet</p>
            <p className="mt-1 max-w-sm text-xs">Choose a station and model, then run the prediction. Results come from the trained models and the stored dataset.</p>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Estimated · not a measurement</p>
                <p className="mt-1 font-display text-5xl font-semibold">{fmt(result.predictions.at(-1).depth_mbgl)}<span className="ml-2 text-lg text-forest-900/50">mbgl</span></p>
                <p className="mt-1 text-sm text-forest-900/65">Predicted depth for <b>{fmtDate(result.predictions.at(-1).date)}</b></p>
                {categoryOf(result.predictions.at(-1).depth_mbgl) && (
                  <span className="mt-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold text-white"
                    style={{ background: categoryOf(result.predictions.at(-1).depth_mbgl).color }}>
                    {categoryOf(result.predictions.at(-1).depth_mbgl).note} · {categoryOf(result.predictions.at(-1).depth_mbgl).key}
                  </span>
                )}
              </div>
              <dl className="grid grid-cols-[auto_auto] gap-x-4 gap-y-1 rounded-xl bg-forest-900/[.04] p-3.5 text-xs">
                <dt className="text-forest-900/55">Model</dt><dd className="text-right font-semibold">{result.model}</dd>
                <dt className="text-forest-900/55">Station</dt><dd className="text-right font-semibold">{result.station_name}</dd>
                <dt className="text-forest-900/55">Predicted at</dt><dd className="text-right font-semibold">{new Date(result.created_at).toLocaleString("en-IN")}</dd>
                <dt className="text-forest-900/55">Last measurement</dt><dd className="text-right font-semibold">{fmt(result.last_observed.depth_mbgl)} mbgl · {fmtDate(result.last_observed.date)}</dd>
              </dl>
            </div>

            <div className="h-[300px]">
              <ResponsiveContainer>
                <LineChart data={chartData} margin={{ left: 0, right: 12, top: 8 }}>
                  <CartesianGrid stroke={chartTheme.grid} vertical={false} />
                  <XAxis dataKey="date" stroke={chartTheme.axis} fontSize={11} tickLine={false} minTickGap={36} />
                  <YAxis reversed stroke={chartTheme.axis} fontSize={11} tickLine={false} width={40} domain={["auto", "auto"]} />
                  <Tooltip contentStyle={chartTheme.tooltip} formatter={(v, n) => [`${fmt(v)} mbgl`, n]} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <ReferenceLine x={result.last_observed.date} stroke={chartTheme.axis} strokeDasharray="3 3" />
                  <Line name="Measured depth" dataKey="measured" stroke={chartTheme.ink} strokeWidth={2.2} dot={{ r: 2 }} connectNulls />
                  <Line name="Predicted depth (estimate)" dataKey="predicted" stroke={MODEL_COLORS[result.model]} strokeWidth={2.4} strokeDasharray="6 4" dot={{ r: 4 }} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {result.predictions.length > 1 && (
              <table className="w-full text-sm">
                <thead><tr className="text-left text-xs uppercase tracking-wide text-forest-900/50"><th className="pb-2">Step</th><th>Date</th><th className="text-right">Predicted depth (mbgl)</th></tr></thead>
                <tbody>{result.predictions.map((p, i) => (
                  <tr key={p.date} className="border-t border-forest-900/5"><td className="py-2">+{i + 1}</td><td>{fmtDate(p.date)}</td><td className="text-right font-semibold">{fmt(p.depth_mbgl)}</td></tr>
                ))}</tbody>
              </table>
            )}

            <div className="rounded-xl bg-aqua-50 p-4 text-sm leading-relaxed text-forest-900/80 ring-1 ring-aqua-200">
              <p className="font-semibold text-aqua-600">How to read this result</p>
              <p className="mt-1.5">
                {result.model} used the last {result.window} readings at <b>{result.station_name}</b>, recorded about every {result.step_days} {result.step_days === 1 ? "day" : "days"} ({result.frequency}),
                and estimates the water level will be about <b>{fmt(result.predictions[0].depth_mbgl)} mbgl</b> by {fmtDate(result.predictions[0].date)},
                compared with <b>{fmt(result.last_observed.depth_mbgl)} mbgl</b> measured on {fmtDate(result.last_observed.date)}{" "}
                ({result.predictions[0].depth_mbgl > result.last_observed.depth_mbgl ? "water table lower" : "water table higher"} by {fmt(Math.abs(result.predictions[0].depth_mbgl - result.last_observed.depth_mbgl))} m).
                {(() => {
                  const m = result.model_test_metrics?.by_type?.[result.station_type] || result.model_test_metrics;
                  return m && <> On held-out later readings from {result.station_type === "telemetric" ? "sensor" : result.station_type === "manual" ? "manual" : "all"} wells, this model was off by <b>{fmt(m.mae)} m</b> on average (RMSE <b>{fmt(m.rmse)} m</b>), so treat the figure as an estimate with an error of roughly that size.</>;
                })()}
              </p>
              <p className="mt-2 text-xs text-forest-900/60">Predictions are model estimates, not direct measurements. They apply to this monitoring station only, not to nearby villages or GPS points.</p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
