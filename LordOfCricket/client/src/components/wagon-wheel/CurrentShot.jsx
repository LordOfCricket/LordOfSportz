import { GROUND, shotToPoint } from '../../models/wagonWheel.model.js'

export default function CurrentShot({ shot }) {
  if (!shot) return null
  const { cx, cy } = GROUND
  const point = shotToPoint(shot)

  return (
    <g>
      <line
        x1={cx}
        y1={cy}
        x2={point.x}
        y2={point.y}
        className="stroke-white"
        strokeWidth="2.5"
        strokeDasharray="3 5"
        strokeLinecap="round"
      />
      <circle cx={point.x} cy={point.y} r="7" className="fill-white/25" />
      <circle cx={point.x} cy={point.y} r="4" className="fill-white animate-pulse" />
    </g>
  )
}
