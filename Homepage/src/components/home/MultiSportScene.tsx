"use client";

import { useState } from "react";

type SportKey = "cricket" | "karate" | "tennis";

const sports: { key: SportKey; label: string; number: string }[] = [
  { key: "cricket", label: "Cricket", number: "01" },
  { key: "karate", label: "Karate", number: "02" },
  { key: "tennis", label: "Lawn Tennis", number: "03" },
];

export default function MultiSportScene() {
  const [activeSport, setActiveSport] = useState<SportKey | null>(null);

  return (
    <div className="multi-sport-scene" onMouseLeave={() => setActiveSport(null)}>
      <svg className="athlete-stage" viewBox="0 0 1200 700" role="img" aria-labelledby="athlete-stage-title athlete-stage-description">
        <title id="athlete-stage-title">Three athletes in motion: cricket, karate and lawn tennis</title>
        <desc id="athlete-stage-description">Stylized campaign silhouettes show a cricket batting swing, a karate strike and a tennis serve in one shared scene.</desc>
        <defs>
          <radialGradient id="stage-light" cx="50%" cy="45%" r="58%">
            <stop offset="0" stopColor="#4ade80" stopOpacity=".13" />
            <stop offset=".45" stopColor="#4ade80" stopOpacity=".035" />
            <stop offset="1" stopColor="#050706" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="floor-line" x1="0" x2="1">
            <stop offset="0" stopColor="#4ade80" stopOpacity="0" />
            <stop offset=".5" stopColor="#4ade80" stopOpacity=".7" />
            <stop offset="1" stopColor="#4ade80" stopOpacity="0" />
          </linearGradient>
          <filter id="soft-glow">
            <feGaussianBlur stdDeviation="12" />
          </filter>
        </defs>

        <ellipse cx="600" cy="350" rx="480" ry="310" fill="url(#stage-light)" />
        <ellipse cx="600" cy="612" rx="520" ry="12" fill="#4ade80" opacity=".08" filter="url(#soft-glow)" />
        <path d="M70 612H1130" stroke="url(#floor-line)" strokeWidth="1" />
        <path d="M180 590H1020" stroke="#f5f5f4" strokeOpacity=".08" strokeWidth="1" strokeDasharray="2 14" />

        <g className={`athlete athlete-cricket ${activeSport && activeSport !== "cricket" ? "is-muted" : ""}`}>
          <circle className="athlete-aura" cx="220" cy="372" r="170" />
          <g className="cricket-body">
            <circle cx="234" cy="205" r="27" fill="#f5f5f4" />
            <path d="M218 236C188 272 184 344 208 401L276 394C291 331 276 269 247 239Z" fill="#f5f5f4" />
            <path d="M213 391L189 548" stroke="#f5f5f4" strokeWidth="25" strokeLinecap="round" />
            <path d="M263 392L315 543" stroke="#f5f5f4" strokeWidth="25" strokeLinecap="round" />
            <path d="M185 547L158 589M313 542L348 584" stroke="#f5f5f4" strokeWidth="13" strokeLinecap="round" />
            <path className="cricket-arm cricket-arm-back" d="M218 258L148 342L115 290" stroke="#f5f5f4" strokeWidth="19" strokeLinecap="round" fill="none" />
            <path className="cricket-arm cricket-arm-front" d="M248 259L302 310L345 242" stroke="#f5f5f4" strokeWidth="19" strokeLinecap="round" fill="none" />
            <path className="cricket-bat" d="M344 242L415 115" stroke="#c8a879" strokeWidth="17" strokeLinecap="round" />
            <path d="M411 113L435 77" stroke="#c8a879" strokeWidth="10" strokeLinecap="round" />
            <circle className="cricket-ball" cx="458" cy="165" r="7" fill="#4ade80" />
          </g>
        </g>

        <g className={`athlete athlete-karate ${activeSport && activeSport !== "karate" ? "is-muted" : ""}`}>
          <circle className="athlete-aura" cx="602" cy="355" r="176" />
          <g className="karate-body">
            <circle cx="596" cy="198" r="27" fill="#f5f5f4" />
            <path d="M574 230L532 376L613 405L665 365L634 238Z" fill="#f5f5f4" />
            <path d="M545 370L453 493" stroke="#f5f5f4" strokeWidth="25" strokeLinecap="round" />
            <path d="M611 391L715 482" stroke="#f5f5f4" strokeWidth="25" strokeLinecap="round" />
            <path d="M451 492L407 548M712 481L765 530" stroke="#f5f5f4" strokeWidth="13" strokeLinecap="round" />
            <path className="karate-arm karate-arm-back" d="M580 254L509 285L444 250" stroke="#f5f5f4" strokeWidth="20" strokeLinecap="round" fill="none" />
            <path className="karate-arm karate-arm-front" d="M628 253L700 289L786 230" stroke="#f5f5f4" strokeWidth="20" strokeLinecap="round" fill="none" />
            <path className="karate-strike" d="M781 230L850 180" stroke="#4ade80" strokeWidth="8" strokeLinecap="round" opacity=".8" />
            <path d="M770 233L846 179" stroke="#f5f5f4" strokeWidth="16" strokeLinecap="round" />
          </g>
        </g>

        <g className={`athlete athlete-tennis ${activeSport && activeSport !== "tennis" ? "is-muted" : ""}`}>
          <circle className="athlete-aura" cx="976" cy="363" r="170" />
          <g className="tennis-body">
            <circle cx="974" cy="198" r="27" fill="#f5f5f4" />
            <path d="M954 230C922 270 922 345 949 400L1014 391C1028 326 1014 267 987 235Z" fill="#f5f5f4" />
            <path d="M958 392L904 543" stroke="#f5f5f4" strokeWidth="25" strokeLinecap="round" />
            <path d="M1007 389L1062 536" stroke="#f5f5f4" strokeWidth="25" strokeLinecap="round" />
            <path d="M901 542L871 587M1061 535L1094 581" stroke="#f5f5f4" strokeWidth="13" strokeLinecap="round" />
            <path className="tennis-arm tennis-arm-back" d="M958 261L893 310L846 256" stroke="#f5f5f4" strokeWidth="19" strokeLinecap="round" fill="none" />
            <path className="tennis-arm tennis-arm-front" d="M988 255L1045 300L1091 223" stroke="#f5f5f4" strokeWidth="19" strokeLinecap="round" fill="none" />
            <g className="tennis-racket">
              <ellipse cx="1111" cy="177" rx="31" ry="42" fill="none" stroke="#c8a879" strokeWidth="9" />
              <path d="M1093 211L1044 318" stroke="#c8a879" strokeWidth="12" strokeLinecap="round" />
            </g>
            <circle className="tennis-ball" cx="1136" cy="290" r="7" fill="#4ade80" />
          </g>
        </g>
      </svg>

      <div className="athlete-labels" aria-label="Sports in the hero scene">
        {sports.map((sport) => (
          <button
            key={sport.key}
            type="button"
            className={`athlete-label athlete-label-${sport.key} ${activeSport === sport.key ? "is-active" : ""}`}
            onMouseEnter={() => setActiveSport(sport.key)}
            onFocus={() => setActiveSport(sport.key)}
            onBlur={() => setActiveSport(null)}
            onClick={() => setActiveSport(activeSport === sport.key ? null : sport.key)}
            aria-pressed={activeSport === sport.key}
          >
            <span>{sport.number}</span> / {sport.label}
          </button>
        ))}
      </div>
    </div>
  );
}
