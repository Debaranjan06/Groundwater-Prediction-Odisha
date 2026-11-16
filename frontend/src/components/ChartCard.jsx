import { EmptyState, ErrorState, Loader } from "./States";

/** Card wrapper that handles loading / error / empty and renders children(data) otherwise. */
export default function ChartCard({
  title, subtitle, res, height = 300, action, children,
  isEmpty = (d) => !d || (Array.isArray(d) && d.length === 0),
  emptyTitle, emptyHint, className = "",
}) {
  return (
    <section className={`card p-5 ${className}`}>
      <header className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-lg font-semibold leading-tight">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-forest-900/55">{subtitle}</p>}
        </div>
        {action}
      </header>
      <div style={{ height }}>
        {res.loading ? <Loader /> : res.error ? <ErrorState error={res.error} onRetry={res.reload} /> :
          isEmpty(res.data) ? <EmptyState title={emptyTitle} hint={emptyHint} /> : children(res.data)}
      </div>
    </section>
  );
}
