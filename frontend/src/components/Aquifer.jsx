/** Groundwater cross-section illustration: rain → soil → unconfined aquifer → clay → confined aquifer, with a monitoring well. */
export default function Aquifer({ className = "" }) {
  const drops = Array.from({ length: 14 }, (_, i) => ({ x: 40 + i * 38, d: (i % 7) * 0.25, h: 10 + (i % 3) * 5 }));
  return (
    <svg viewBox="0 0 560 470" className={className} role="img" aria-label="Groundwater cross-section illustration">
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0e7fb0" stopOpacity=".35" /><stop offset="1" stopColor="#0e7fb0" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="aq1" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3fbcee" stopOpacity=".75" /><stop offset="1" stopColor="#16a0d8" stopOpacity=".9" />
        </linearGradient>
        <linearGradient id="aq2" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0e7fb0" /><stop offset="1" stopColor="#0a5f85" />
        </linearGradient>
        <pattern id="grain" width="12" height="12" patternUnits="userSpaceOnUse">
          <circle cx="3" cy="4" r="1" fill="#fff" fillOpacity=".12" /><circle cx="9" cy="9" r="1.2" fill="#fff" fillOpacity=".1" />
        </pattern>
      </defs>
      <rect width="560" height="150" fill="url(#sky)" />
      {drops.map((d, i) => (
        <line key={i} x1={d.x} x2={d.x - 4} y1="30" y2={30 + d.h} stroke="#7fd6f7" strokeWidth="2" strokeLinecap="round"
          className="animate-rain" style={{ animationDelay: `${d.delay ?? d.d}s` }} />
      ))}
      {/* hills / surface */}
      <path d="M0 160 Q90 128 180 150 T360 146 T560 154 L560 190 L0 190Z" fill="#17724f" />
      <path d="M0 190 H560 V232 H0Z" fill="#8a6a45" /><rect y="190" width="560" height="42" fill="url(#grain)" />
      {/* unconfined aquifer */}
      <path d="M0 232 H560 V300 H0Z" fill="#c9b27c" />
      <path d="M0 262 Q140 252 280 264 T560 258 V300 H0Z" fill="url(#aq1)" />
      <path d="M0 262 Q140 252 280 264 T560 258" fill="none" stroke="#e8fbff" strokeWidth="2" strokeDasharray="6 5" />
      <text x="16" y="254" fill="#fff" fontSize="11" fontWeight="600" opacity=".9">water table</text>
      {/* clay aquitard */}
      <path d="M0 300 H560 V332 H0Z" fill="#6b4d3a" /><rect y="300" width="560" height="32" fill="url(#grain)" />
      <text x="16" y="321" fill="#f4e6d8" fontSize="11" fontWeight="600" opacity=".85">clay (aquitard)</text>
      {/* confined aquifer */}
      <path d="M0 332 H560 V400 H0Z" fill="url(#aq2)" />
      <text x="16" y="372" fill="#fff" fontSize="11" fontWeight="600" opacity=".9">confined aquifer</text>
      <path d="M0 400 H560 V470 H0Z" fill="#3b3a36" /><rect y="400" width="560" height="70" fill="url(#grain)" />
      {/* monitoring well */}
      <rect x="352" y="150" width="14" height="190" rx="2" fill="#e8efe9" stroke="#0b3d2e" strokeOpacity=".4" />
      <rect x="346" y="140" width="26" height="14" rx="3" fill="#0b3d2e" />
      <rect x="353" y="262" width="12" height="78" fill="#3fbcee" fillOpacity=".8" />
      <circle cx="359" cy="262" r="6" fill="#7fd6f7" className="animate-ring" />
      <circle cx="359" cy="262" r="4" fill="#fff" />
      {/* depth arrow */}
      <g stroke="#fff" strokeWidth="1.6" fill="none" strokeLinecap="round">
        <line x1="410" y1="156" x2="410" y2="262" strokeDasharray="3 4" />
        <path d="M404 252 L410 262 L416 252" /><path d="M404 166 L410 156 L416 166" />
      </g>
      <rect x="422" y="192" width="106" height="40" rx="10" fill="#062a20" fillOpacity=".88" />
      <text x="475" y="209" textAnchor="middle" fill="#7fd6f7" fontSize="10" fontWeight="600">DEPTH TO WATER</text>
      <text x="475" y="224" textAnchor="middle" fill="#fff" fontSize="13" fontWeight="700">metres (mbgl)</text>
      <text x="359" y="130" textAnchor="middle" fill="#0b3d2e" fontSize="10" fontWeight="700">CGWB well</text>
    </svg>
  );
}
