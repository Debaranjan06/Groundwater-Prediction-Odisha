import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, Eye, EyeOff, Loader2, Lock, Mail, User } from "lucide-react";
import Aquifer from "../components/Aquifer";
import { Logo } from "../components/Layout";
import { useAuth } from "../lib/auth";
import { ThemeToggle } from "../lib/theme";

export default function Login() {
  const { user, login, register } = useAuth();
  const nav = useNavigate();
  const from = useLocation().state?.from || "/dashboard";
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (user) return <Navigate to={from} replace />;
  const isReg = mode === "register";
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setError("");
    if (isReg && form.name.trim().length < 2) return setError("Please enter your name.");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email)) return setError("Enter a valid email address.");
    if (form.password.length < (isReg ? 8 : 1)) return setError(isReg ? "Password must be at least 8 characters." : "Enter your password.");
    setBusy(true);
    try {
      if (isReg) await register(form.name.trim(), form.email, form.password);
      else await login(form.email, form.password);
      nav(from, { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <div className="relative hidden overflow-hidden bg-forest-900 contours lg:block">
        <div className="absolute inset-0 bg-gradient-to-b from-forest-950/40 to-transparent" />
        <div className="relative flex h-full flex-col justify-between p-12">
          <Logo dark />
          <div>
            <p className="text-xs font-semibold uppercase tracking-[.2em] text-aqua-300">Environmental AI research platform</p>
            <h2 className="mt-3 max-w-md font-display text-4xl font-semibold leading-tight text-white">
              Reading the water table of Odisha, one well at a time.
            </h2>
            <p className="mt-4 max-w-md text-sm leading-relaxed text-white/65">
              Compare Linear Regression, Random Forest, Gradient Boosting and neural-network forecasts against measured groundwater depth.
            </p>
          </div>
          <Aquifer className="-mb-12 -ml-6 w-[115%] max-w-none opacity-95" />
        </div>
      </div>

      <div className="flex flex-col justify-center px-6 py-10 sm:px-14">
        <div className="mb-8 flex items-center justify-between">
          <Link to="/" className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-forest-900/60 transition hover:text-forest-900">
            <ArrowLeft className="h-4 w-4" />Back to home
          </Link>
          <ThemeToggle />
        </div>
        <div className="mx-auto w-full max-w-sm">
          <h1 className="font-display text-3xl font-semibold">{isReg ? "Create your account" : "Welcome back"}</h1>
          <p className="mt-1.5 text-sm text-forest-900/60">
            {isReg ? "Register to explore the dashboard and run predictions." : "Sign in to open the groundwater dashboard."}
          </p>

          <form onSubmit={submit} className="mt-8 space-y-4" noValidate>
            {isReg && (
              <Field icon={User} label="Full name">
                <input className="input !pl-10" value={form.name} onChange={set("name")} autoComplete="name" placeholder="Your name" />
              </Field>
            )}
            <Field icon={Mail} label="Email">
              <input className="input !pl-10" type="email" value={form.email} onChange={set("email")} autoComplete="email" placeholder="you@example.com" />
            </Field>
            <Field icon={Lock} label="Password">
              <input className="input !pl-10 !pr-10" type={show ? "text" : "password"} value={form.password} onChange={set("password")}
                autoComplete={isReg ? "new-password" : "current-password"} placeholder={isReg ? "At least 8 characters" : "Your password"} />
              <button type="button" onClick={() => setShow(!show)} className="absolute right-3 top-1/2 -translate-y-1/2 text-forest-900/40 hover:text-forest-900" aria-label="Toggle password visibility">
                {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </Field>

            {error && <p role="alert" className="rounded-xl bg-red-50 px-3.5 py-2.5 text-sm text-red-700 ring-1 ring-red-200">{error}</p>}

            <button className="btn-primary w-full !py-3" disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {isReg ? "Create account" : "Sign in"}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-forest-900/60">
            {isReg ? "Already have an account?" : "New here?"}{" "}
            <button className="font-semibold text-emerald-700 hover:underline" onClick={() => { setMode(isReg ? "login" : "register"); setError(""); }}>
              {isReg ? "Sign in" : "Create an account"}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}

function Field({ icon: Icon, label, children }) {
  return (
    <div>
      <label className="label">{label}</label>
      <div className="relative">
        <Icon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-forest-900/40" />
        {children}
      </div>
    </div>
  );
}
