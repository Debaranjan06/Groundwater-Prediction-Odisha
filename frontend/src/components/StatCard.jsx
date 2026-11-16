export default function StatCard({ icon: Icon, label, value, unit, sub, tone = "emerald", loading }) {
  const tones = {
    emerald: "bg-emerald-50 text-emerald-700",
    aqua: "bg-aqua-100 text-aqua-600",
    amber: "bg-amber-50 text-amber-700",
    forest: "bg-forest-900/5 text-forest-800",
  };
  return (
    <div className="card animate-rise p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-forest-900/55">{label}</p>
        <span className={`grid h-8 w-8 place-items-center rounded-lg ${tones[tone]}`}><Icon className="h-4 w-4" /></span>
      </div>
      <p className="mt-3 font-display text-2xl font-semibold leading-none">
        {loading ? <span className="inline-block h-6 w-20 animate-pulse rounded bg-forest-900/10" /> : value}
        {!loading && unit && <span className="ml-1 text-sm font-medium text-forest-900/50">{unit}</span>}
      </p>
      {sub && <p className="mt-2 text-xs leading-snug text-forest-900/55">{sub}</p>}
    </div>
  );
}
