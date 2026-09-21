const INK = "#0c0d10";
const PAPER = "#f5f3ee";
const body = { fill: INK, stroke: PAPER, strokeOpacity: 0.55, strokeWidth: 1.5, strokeLinejoin: "round" } as const;

// Editorial still life: rising-sun disc, a clenched fist and a tied black belt on a tatami ground line.
export default function KarateScene() {
  return (
    <div className="k-scene" aria-hidden="true">
      <svg viewBox="0 0 700 700" preserveAspectRatio="xMaxYMid meet" className="h-full w-full">
        <g className="k-disc">
          <circle cx="430" cy="300" r="215" fill="#b0323a" fillOpacity="0.92" />
          <circle cx="430" cy="300" r="245" fill="none" stroke={PAPER} strokeOpacity="0.1" strokeWidth="1.2" />
        </g>

        <g transform="translate(232 128) scale(2.35)">
          <rect x="14" y="98" width="78" height="52" rx="8" {...body} />
          <rect x="0" y="34" width="106" height="72" rx="20" {...body} />
          <rect x="0" y="0" width="27" height="54" rx="13" {...body} />
          <rect x="26" y="-6" width="27" height="58" rx="13" {...body} />
          <rect x="52" y="-6" width="27" height="58" rx="13" {...body} />
          <rect x="78" y="0" width="28" height="54" rx="13" {...body} />
          <rect x="8" y="58" width="72" height="24" rx="12" {...body} />
        </g>

        <g transform="rotate(-6 350 545)">
          <path d="M300 585L268 665l26 8 34-72z" {...body} />
          <path d="M372 585l34 80-26 8-32-72z" {...body} />
          <rect x="50" y="500" width="600" height="50" rx="4" {...body} />
          <path d="M50 517H650M50 533H650" stroke={PAPER} strokeOpacity="0.14" strokeWidth="1" />
          <rect x="312" y="486" width="76" height="78" rx="10" {...body} />
          <path d="M326 500V550M350 500V550M374 500V550" stroke={PAPER} strokeOpacity="0.14" strokeWidth="1" />
        </g>

        <path d="M20 640H690" stroke={PAPER} strokeOpacity="0.12" strokeWidth="1.2" />
      </svg>
    </div>
  );
}
