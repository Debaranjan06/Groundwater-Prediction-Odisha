---
trigger: glob
globs: frontend/src/**/*.jsx, frontend/src/**/*.js, frontend/src/**/*.css, frontend/tailwind.config.js
description: Visual and code conventions for the Bhujal React frontend
---

# Bhujal frontend conventions

- Brand: "Bhujal" with the sub-label "Odisha groundwater". Never add "AI" to the name.
- Palette: Tailwind tokens only (`forest-*` dark greens, `emerald-*`, `aqua-*` light blues, `mist` background, white cards). Do not hard-code new hex colours except in chart series, and reuse `MODEL_COLORS` and `DEPTH_CATEGORIES` from `src/lib/utils.jsx`.
- Typography: `font-display` (Fraunces) for headings and big numbers, DM Sans for everything else.
- Reuse the component classes in `src/index.css`: `.card`, `.btn-primary`, `.btn-outline`, `.btn-dark`, `.btn-ghost`, `.input`, `.label`.
- Data cards: wrap charts in `ChartCard` and fetch with `useFetch`, so loading, error and empty states come for free.
- Charts (Recharts): reversed y-axis for depth, units in axis labels or tooltips ("mbgl", "mm/day", "°C"), `chartTheme` for grid, axis and tooltip styling.
- Measured series are solid dark lines; predicted series are dashed lines in the model colour and labelled "(predicted)" or "estimate".
- Layout must work at 390 px wide: no horizontal page scroll; tables go inside `overflow-x-auto`.
- Copy: short, plain sentences. Say what a number is and where it comes from. No marketing superlatives.
