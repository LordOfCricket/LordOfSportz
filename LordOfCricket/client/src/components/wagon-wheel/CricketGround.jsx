import { GROUND } from '../../models/wagonWheel.model.js'

export default function CricketGround() {
  const { cx, cy, boundaryRadius, infieldRadius, pitchTopY, pitchWidth } = GROUND

  return (
    <g>
      {/* Outfield + boundary */}
      <circle cx={cx} cy={cy} r={boundaryRadius} className="fill-emerald-800/40 stroke-emerald-300/40" strokeWidth="2" />
      <circle cx={cx} cy={cy} r={boundaryRadius - 6} className="fill-none stroke-white/15" strokeWidth="1" strokeDasharray="4 6" />

      {/* 30-yard circle */}
      <circle cx={cx} cy={cy} r={infieldRadius} className="fill-emerald-700/25 stroke-white/15" strokeWidth="1.5" strokeDasharray="6 5" />

      {/* Off side / leg side labels */}
      <text x={cx - infieldRadius - 30} y={cy + 4} textAnchor="middle" className="fill-emerald-100/35 text-[13px] font-semibold uppercase tracking-[0.25em]">
        Off Side
      </text>
      <text x={cx + infieldRadius + 30} y={cy + 4} textAnchor="middle" className="fill-emerald-100/35 text-[13px] font-semibold uppercase tracking-[0.25em]">
        Leg Side
      </text>

      {/* Pitch */}
      <rect
        x={cx - pitchWidth / 2}
        y={pitchTopY}
        width={pitchWidth}
        height={cy - pitchTopY}
        rx="2"
        className="fill-amber-100/20 stroke-amber-100/30"
        strokeWidth="1"
      />
      {/* Bowling crease (bowler end) */}
      <line x1={cx - 22} y1={pitchTopY} x2={cx + 22} y2={pitchTopY} className="stroke-white/40" strokeWidth="2" />
      {/* Popping crease (batsman end) */}
      <line x1={cx - 22} y1={cy} x2={cx + 22} y2={cy} className="stroke-white/40" strokeWidth="2" />

      {/* Bowler direction indicator */}
      <line x1={cx} y1={cy - 30} x2={cx} y2={pitchTopY + 10} className="stroke-emerald-200/50" strokeWidth="1.5" markerEnd="url(#bowlerArrow)" />
      <text x={cx} y={pitchTopY - 8} textAnchor="middle" className="fill-emerald-100/45 text-[11px] font-semibold uppercase tracking-[0.2em]">
        Bowler End
      </text>

      <defs>
        <marker id="bowlerArrow" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto">
          <path d="M0,0 L8,4 L0,8 Z" className="fill-emerald-200/60" />
        </marker>
      </defs>

      {/* Batsman marker */}
      <circle cx={cx} cy={cy} r="10" className="fill-amber-300/20" />
      <circle cx={cx} cy={cy} r="6" className="fill-amber-300 stroke-emerald-950" strokeWidth="1.5" />
    </g>
  )
}
