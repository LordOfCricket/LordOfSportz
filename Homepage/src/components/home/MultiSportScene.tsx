const AMBER = "#e9b949";
const body = { fill: "url(#form-fill)", stroke: AMBER, strokeWidth: 1.6, strokeLinejoin: "round", strokeLinecap: "round" } as const;
const line = { fill: "none", stroke: AMBER, strokeWidth: 1.4, strokeLinecap: "round" } as const;

// Editorial still life: four sports' equipment in one shared "arena" (boundary circle, court lines).
export default function MultiSportScene() {
  return (
    <div className="sport-scene" role="img" aria-label="Cricket stumps and bat, a football, a tennis racket and a karate fist">
      <svg viewBox="0 0 800 800" preserveAspectRatio="xMaxYMid meet" className="h-full w-full">
        <defs>
          <linearGradient id="form-fill" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#1d1d20" />
            <stop offset="1" stopColor="#111113" />
          </linearGradient>
          <clipPath id="racket-head">
            <ellipse cx="0" cy="0" rx="54" ry="70" />
          </clipPath>
        </defs>

        <g className="scene-layer scene-far" fill="none" stroke="#f5f5f4" strokeOpacity=".09" strokeWidth="1.2">
          <circle cx="430" cy="400" r="330" />
          <circle cx="430" cy="400" r="215" strokeOpacity=".06" />
          <path d="M120 735H760" />
          <path d="M175 735L255 585H640L720 735M255 585L720 735M640 585L175 735" strokeOpacity=".07" />
          <path d="M448 585V735" strokeOpacity=".07" />
        </g>

        <g className="scene-layer scene-mid">
          <g transform="translate(150 350) scale(1.15)">
            <rect x="0" y="0" width="14" height="210" rx="6" {...body} />
            <rect x="30" y="0" width="14" height="210" rx="6" {...body} />
            <rect x="60" y="0" width="14" height="210" rx="6" {...body} />
            <rect x="6" y="-7" width="30" height="6" rx="3" {...body} />
            <rect x="38" y="-7" width="30" height="6" rx="3" {...body} />
          </g>
          <g transform="translate(345 350) rotate(20)">
            <rect x="-24" y="0" width="48" height="178" rx="12" {...body} />
            <path d="M0 14V150" {...line} strokeOpacity=".5" />
            <rect x="-8" y="-70" width="16" height="72" rx="7" {...body} />
          </g>
          <g transform="translate(410 555)">
            <circle r="15" {...body} />
            <path d="M-11 -9C-3 -3 -3 3 -11 9M11 -9C3 -3 3 3 11 9" {...line} strokeWidth={1.2} />
          </g>
        </g>

        <g className="scene-layer scene-near">
          <g transform="translate(565 255)">
            <circle r="128" {...body} />
            <path d="M0 -44L42 -14L26 36H-26L-42 -14Z" {...body} />
            <path d="M0 -44V-126M42 -14L122 -40M26 36L74 104M-26 36L-74 104M-42 -14L-122 -40" {...line} />
            <path d="M-42 -14L-74 -96M42 -14L74 -96" {...line} strokeOpacity=".45" />
          </g>
          <g transform="translate(560 470) scale(1.35)">
            <rect x="14" y="98" width="78" height="46" rx="8" {...body} />
            <rect x="0" y="34" width="106" height="72" rx="20" {...body} />
            <rect x="0" y="0" width="27" height="54" rx="13" {...body} />
            <rect x="26" y="-6" width="27" height="58" rx="13" {...body} />
            <rect x="52" y="-6" width="27" height="58" rx="13" {...body} />
            <rect x="78" y="0" width="28" height="54" rx="13" {...body} />
            <rect x="8" y="58" width="72" height="24" rx="12" {...body} />
            <path d="M14 112H92" {...line} strokeOpacity=".5" />
          </g>
          <g transform="translate(262 640) rotate(-34)">
            <ellipse cx="0" cy="0" rx="54" ry="70" {...body} />
            <g clipPath="url(#racket-head)" {...line} strokeOpacity=".5" strokeWidth={1}>
              <path d="M-40 -70V70M-20 -70V70M0 -70V70M20 -70V70M40 -70V70" />
              <path d="M-54 -48H54M-54 -24H54M-54 0H54M-54 24H54M-54 48H54" />
            </g>
            <ellipse cx="0" cy="0" rx="54" ry="70" fill="none" stroke={AMBER} strokeWidth={3} />
            <path d="M-12 68L0 104L12 68" {...line} />
            <rect x="-8" y="102" width="16" height="72" rx="7" {...body} />
          </g>
          <g transform="translate(492 442)">
            <circle r="16" {...body} />
            <path d="M-12 -10C-4 -3 -4 3 -12 10M12 -10C4 -3 4 3 12 10" {...line} strokeWidth={1.2} />
          </g>
        </g>
      </svg>
    </div>
  );
}
