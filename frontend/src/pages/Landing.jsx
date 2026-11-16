import { Link } from "react-router-dom";
import {
  ArrowRight, BarChart3, BrainCircuit, CloudRain, Database, Eraser, GitMerge, Layers, LineChart, Scale,
  Sparkles, Split, Target, Thermometer, Waves,
} from "lucide-react";
import Aquifer from "../components/Aquifer";
import { Logo } from "../components/Layout";
import { useAuth } from "../lib/auth";
import { ThemeToggle } from "../lib/theme";
import { api } from "../lib/api";
import { useFetch } from "../lib/hooks";

const OBJECTIVES = [
  { icon: LineChart, title: "Understand trends", text: "Explore how groundwater depth (mbgl) has changed at CGWB monitoring stations across Odisha." },
  { icon: CloudRain, title: "Link to environment", text: "Relate depth to the rainfall and temperature recorded with each reading." },
  { icon: BrainCircuit, title: "Forecast with machine learning", text: "Train lightweight models that run on an ordinary laptop to estimate the next groundwater depth." },
  { icon: Scale, title: "Compare honestly", text: "Compare Linear Regression, Random Forest, Gradient Boosting and a small neural network using MAE, RMSE and R² on a held-out future period." },
];

const STEPS = [
  { icon: Database, title: "Collect", text: "An India-wide groundwater and climate time series from Kaggle (CGWB wells with rainfall and temperature), 1994–2025." },
  { icon: GitMerge, title: "Locate", text: "Keep only wells inside Odisha's 30 official district boundaries and give each well its district name." },
  { icon: Eraser, title: "Clean", text: "Put manual and sensor wells on one depth scale (mbgl), drop readings with impossible signs, and fill gaps from past values only." },
  { icon: Layers, title: "Window", text: "Build sliding windows of past observations as inputs for every model." },
  { icon: Split, title: "Split in time", text: "Train on earlier readings, test on the latest 20% of each well type. Scalers are fitted on training data only to avoid leakage." },
  { icon: Sparkles, title: "Predict", text: "Estimate the next depth at the station's own observation frequency, with metrics from the real test set." },
];

const TECH = [
  ["React", "Interface"], ["Tailwind CSS", "Styling"], ["Recharts", "Charts"], ["Leaflet", "Maps"],
  ["FastAPI", "REST API"], ["MongoDB", "Database"], ["scikit-learn", "Linear · Forest · Boosting · MLP"], ["Kaggle", "Dataset source"],
];

export default function Landing() {
  const { user } = useAuth();
  const goto = (p) => (user ? p : "/login");
  const health = useFetch(() => api.health(), []);
  const h = health.data?.status === "ok" && health.data.stations ? health.data : null;

  return (
    <div className="min-h-screen bg-mist">
      <section className="relative overflow-hidden bg-forest-900 contours">
        <div className="absolute -right-32 -top-32 h-96 w-96 rounded-full bg-emerald-500/20 blur-3xl" />
        <div className="absolute -left-24 bottom-0 h-80 w-80 rounded-full bg-aqua-500/20 blur-3xl" />
        <nav className="relative mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <Logo dark />
          <div className="hidden items-center gap-7 text-sm font-medium text-white/70 md:flex">
            <a href="#objectives" className="hover:text-white">Objectives</a>
            <a href="#how" className="hover:text-white">How it works</a>
            <a href="#tech" className="hover:text-white">Technology</a>
            <a href="#gap" className="hover:text-white">Research gap</a>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle className="text-white/70 hover:bg-white/10 hover:text-white" />
            <Link to={user ? "/dashboard" : "/login"} className="btn-ghost !py-2">{user ? "Open dashboard" : "Sign in"}</Link>
          </div>
        </nav>

        <div className="relative mx-auto grid max-w-7xl items-center gap-10 px-6 pb-20 pt-10 lg:grid-cols-2 lg:pb-28 lg:pt-16">
          <div className="animate-rise">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-aqua-200 ring-1 ring-white/15">
              <Waves className="h-3.5 w-3.5" /> University research project · Odisha, India
            </span>
            <h1 className="mt-5 font-display text-4xl font-semibold leading-[1.1] text-white sm:text-5xl">
              Machine Learning-Based Groundwater Level Prediction Using Environmental Data
            </h1>
            <p className="mt-3 font-display text-xl text-emerald-300">A Case Study of Odisha</p>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-white/70">
              Groundwater depth changes slowly and is only measured a few times a year, so planning depends on good estimates.
              This platform studies how well lightweight machine-learning models, fed with past depths, rainfall and other
              environmental signals, forecast depth below ground level, all trainable on an ordinary computer.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to={goto("/dashboard")} className="btn-primary !px-5 !py-3">Explore Dashboard <ArrowRight className="h-4 w-4" /></Link>
              <Link to={goto("/predict")} className="btn-ghost !px-5 !py-3">View Predictions</Link>
            </div>
            <p className="mt-5 max-w-lg text-xs leading-relaxed text-white/45">
              Predictions are model estimates, not direct measurements. Coverage is limited to districts and stations present in the dataset.
            </p>
          </div>
          <div className="relative animate-rise [animation-delay:.15s]">
            <div className="overflow-hidden rounded-3xl ring-1 ring-white/15 shadow-2xl shadow-black/30">
              <Aquifer className="block w-full bg-forest-950/40" />
            </div>
          </div>
        </div>
      </section>

      {h && (
        <section className="relative z-10 mx-auto -mt-10 max-w-5xl px-6">
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl bg-forest-900/10 shadow-card ring-1 ring-forest-900/5 md:grid-cols-4">
            {[
              [h.stations.toLocaleString("en-IN"), "monitoring wells"],
              [h.districts, "Odisha districts"],
              [h.observations.toLocaleString("en-IN"), "measured readings"],
              [`${new Date(h.first_date).getFullYear()}–${new Date(h.last_date).getFullYear()}`, "period covered"],
            ].map(([v, l]) => (
              <div key={l} className="bg-white px-5 py-5 text-center">
                <p className="font-display text-2xl font-semibold text-forest-900">{v}</p>
                <p className="mt-1 text-xs font-medium uppercase tracking-wide text-forest-900/55">{l}</p>
              </div>
            ))}
          </div>
          <p className="mt-2 text-center text-xs text-forest-900/45">Live from the database · source: Kaggle "India Groundwater Climate Time-Series (1994–2025)", Odisha subset</p>
        </section>
      )}

      <section id="objectives" className="mx-auto max-w-7xl px-6 py-20">
        <Heading kicker="Project objectives" title="What this study sets out to do" />
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {OBJECTIVES.map(({ icon: Icon, title, text }) => (
            <div key={title} className="card p-6 transition duration-300 hover:-translate-y-1 hover:shadow-xl">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-emerald-50 text-emerald-700"><Icon className="h-5 w-5" /></span>
              <h3 className="mt-4 text-lg font-semibold">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-forest-900/65">{text}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="how" className="bg-white py-20">
        <div className="mx-auto max-w-7xl px-6">
          <Heading kicker="Methodology" title="How the prediction system works" />
          <ol className="mt-10 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
            {STEPS.map(({ icon: Icon, title, text }, i) => (
              <li key={title} className="relative pl-16">
                <span className="absolute left-0 top-0 grid h-12 w-12 place-items-center rounded-2xl bg-forest-800 text-white">
                  <Icon className="h-5 w-5" />
                </span>
                <span className="absolute -left-1 -top-2 grid h-5 w-5 place-items-center rounded-full bg-aqua-400 text-[10px] font-bold text-forest-950">{i + 1}</span>
                <h3 className="text-lg font-semibold">{title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-forest-900/65">{text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="tech" className="mx-auto max-w-7xl px-6 py-20">
        <Heading kicker="Technologies" title="Built with open, well-known tools" />
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {TECH.map(([name, role]) => (
            <div key={name} className="flex items-center gap-3 rounded-2xl bg-white p-4 ring-1 ring-forest-900/5">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
              <div><p className="font-semibold">{name}</p><p className="text-xs text-forest-900/55">{role}</p></div>
            </div>
          ))}
        </div>
        <div className="mt-6 flex flex-wrap gap-2 text-xs font-medium text-forest-900/70">
          {[[Waves, "Groundwater depth (mbgl)"], [CloudRain, "Rainfall"], [Thermometer, "Temperature"], [Layers, "Season and reading interval"], [BarChart3, "MAE · RMSE · R²"]].map(([Icon, t]) => (
            <span key={t} className="inline-flex items-center gap-1.5 rounded-full bg-aqua-100 px-3 py-1.5 text-aqua-600"><Icon className="h-3.5 w-3.5" />{t}</span>
          ))}
        </div>
      </section>

      <section id="gap" className="bg-forest-900 py-20 text-white contours">
        <div className="mx-auto grid max-w-7xl gap-10 px-6 lg:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[.2em] text-aqua-300">Research gap</p>
            <h2 className="mt-2 font-display text-3xl font-semibold">Why a regional comparison?</h2>
            <p className="mt-4 text-sm leading-relaxed text-white/70">
              Groundwater forecasting with machine learning is an active research area, and similar approaches have been applied elsewhere.
              Regional evidence for Odisha, with several model families evaluated on the same data and the same future test period, is less readily available.
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[.2em] text-emerald-300">Proposed contribution</p>
            <h2 className="mt-2 font-display text-3xl font-semibold">A like-for-like benchmark</h2>
            <ul className="mt-4 space-y-3 text-sm leading-relaxed text-white/70">
              {["Linear Regression, Random Forest, Gradient Boosting and a small neural network compared on one Odisha dataset, against a repeat-last-reading baseline.",
                "Chronological train/test split, with all preprocessing fitted on training data only.",
                "An open dashboard that shows measured and predicted depth separately, with real test metrics.",
              ].map((t) => (
                <li key={t} className="flex gap-3"><Target className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />{t}</li>
              ))}
            </ul>
            <p className="mt-5 rounded-xl bg-white/5 p-4 text-xs leading-relaxed text-white/60 ring-1 ring-white/10">
              This project does not claim the approach is novel. It applies established methods to a regional case study.
              Predictions are station-level estimates; no village-level or GPS-level forecasts are offered.
            </p>
          </div>
        </div>
      </section>

      <footer className="px-6 py-8 text-center text-xs text-forest-900/50">
        Bhujal · Groundwater level prediction, an Odisha case study · Depths in metres below ground level (mbgl)
      </footer>
    </div>
  );
}

function Heading({ kicker, title }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[.2em] text-emerald-700">{kicker}</p>
      <h2 className="mt-2 font-display text-3xl font-semibold">{title}</h2>
    </div>
  );
}
