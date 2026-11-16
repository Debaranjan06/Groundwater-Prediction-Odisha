import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { BarChart3, Database, Droplets, LayoutDashboard, LogOut, Map, Menu, Sparkles, X } from "lucide-react";
import { useAuth } from "../lib/auth";
import { ThemeToggle } from "../lib/theme";
import { api } from "../lib/api";

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/predict", label: "Predictions", icon: Sparkles },
  { to: "/map", label: "Station Map", icon: Map },
  { to: "/data", label: "Data Explorer", icon: Database },
  { to: "/models", label: "Model Comparison", icon: BarChart3 },
];

export function Logo({ dark = false }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-emerald-400 to-aqua-500 text-forest-950 shadow-lg shadow-emerald-500/20">
        <Droplets className="h-5 w-5" />
      </span>
      <div className="leading-tight">
        <p className={`font-display text-lg font-semibold tracking-tight ${dark ? "text-white" : "text-forest-900"}`}>Bhujal</p>
        <p className={`text-[10px] font-semibold uppercase tracking-[.18em] ${dark ? "text-aqua-300" : "text-emerald-700"}`}>Odisha groundwater</p>
      </div>
    </div>
  );
}

export default function Layout() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [health, setHealth] = useState(null);
  const loc = useLocation();

  useEffect(() => setOpen(false), [loc.pathname]);
  useEffect(() => {
    api.health().then(setHealth).catch(() => setHealth({ status: "offline" }));
  }, []);

  const title = NAV.find((n) => loc.pathname.startsWith(n.to))?.label || "";
  const ok = health?.status === "ok";

  const sidebar = (
    <aside className="flex h-full w-64 flex-col bg-forest-900 text-white contours">
      <div className="flex items-center justify-between px-5 py-5">
        <NavLink to="/"><Logo dark /></NavLink>
        <button className="lg:hidden" onClick={() => setOpen(false)} aria-label="Close menu"><X className="h-5 w-5" /></button>
      </div>
      <nav className="mt-2 flex-1 space-y-1 px-3">
        {NAV.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to}
            className={({ isActive }) =>
              `group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                isActive ? "bg-emerald-500/15 text-white ring-1 ring-emerald-400/30" : "text-white/65 hover:bg-white/5 hover:text-white"}`}>
            <Icon className="h-[18px] w-[18px]" />{label}
          </NavLink>
        ))}
      </nav>
      <div className="m-3 rounded-xl bg-white/5 p-3 text-xs text-white/60 ring-1 ring-white/10">
        <p className="font-semibold text-white/80">Estimates, not measurements</p>
        <p className="mt-1 leading-snug">Predictions are model estimates at each station's observation frequency.</p>
      </div>
    </aside>
  );

  return (
    <div className="min-h-screen lg:pl-64">
      <div className="fixed inset-y-0 left-0 z-30 hidden lg:block">{sidebar}</div>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-forest-950/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="relative h-full w-64">{sidebar}</div>
        </div>
      )}

      <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-forest-900/5 bg-mist/85 px-4 py-3 backdrop-blur sm:px-8">
        <div className="flex items-center gap-3">
          <button className="rounded-lg p-2 ring-1 ring-forest-900/10 lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu">
            <Menu className="h-5 w-5" />
          </button>
          <h1 className="font-display text-xl font-semibold">{title}</h1>
        </div>
        <div className="flex items-center gap-3">
          <span className={`hidden items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium sm:inline-flex ${ok ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${ok ? "bg-emerald-500" : "bg-amber-500"}`} />
            {health === null ? "Checking API…" : ok ? "API & MongoDB connected" : "Backend unavailable"}
          </span>
          <ThemeToggle />
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-full bg-forest-800 text-xs font-bold text-white">
              {user?.name?.[0]?.toUpperCase()}
            </span>
            <span className="hidden text-sm font-medium md:block">{user?.name}</span>
            <button onClick={logout} className="rounded-lg p-2 text-forest-900/60 transition hover:bg-forest-900/5 hover:text-forest-900" title="Sign out">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-8">
        <Outlet />
      </main>
    </div>
  );
}
