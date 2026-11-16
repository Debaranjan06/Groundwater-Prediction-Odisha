import { AlertTriangle, DatabaseZap, Loader2, RotateCw } from "lucide-react";

export function Loader({ label = "Loading…" }) {
  return (
    <div className="flex h-full min-h-[120px] flex-col items-center justify-center gap-2 text-sm text-forest-900/60">
      <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
      {label}
    </div>
  );
}

export function ErrorState({ error, onRetry }) {
  return (
    <div className="flex h-full min-h-[120px] flex-col items-center justify-center gap-2 p-4 text-center">
      <AlertTriangle className="h-6 w-6 text-amber-600" />
      <p className="max-w-md text-sm text-forest-900/70">{error?.message || "Something went wrong."}</p>
      {onRetry && (
        <button onClick={onRetry} className="btn-outline !py-1.5 text-xs"><RotateCw className="h-3.5 w-3.5" />Retry</button>
      )}
    </div>
  );
}

export function EmptyState({ title = "No data available", hint, icon: Icon = DatabaseZap }) {
  return (
    <div className="flex h-full min-h-[120px] flex-col items-center justify-center gap-2 p-4 text-center">
      <Icon className="h-7 w-7 text-forest-900/30" />
      <p className="text-sm font-semibold text-forest-900/70">{title}</p>
      {hint && <p className="max-w-md text-xs text-forest-900/50">{hint}</p>}
    </div>
  );
}
