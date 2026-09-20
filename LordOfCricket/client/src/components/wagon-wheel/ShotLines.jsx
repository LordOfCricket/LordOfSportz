import { GROUND, getShotVisual, shotToPoint } from '../../models/wagonWheel.model.js'

export default function ShotLines({ actions }) {
  const { cx, cy } = GROUND

  return (
    <g>
      {actions.map((action) => {
        if (action.x == null || action.y == null) return null
        const visual = getShotVisual(action)
        const point = shotToPoint(action)

        return (
          <g key={action.id}>
            <line
              x1={cx}
              y1={cy}
              x2={point.x}
              y2={point.y}
              stroke={visual.color}
              strokeWidth={visual.width}
              strokeLinecap="round"
            />
            {visual.marker === 'wicket' ? (
              <g stroke={visual.color} strokeWidth="2.5" strokeLinecap="round">
                <line x1={point.x - 5} y1={point.y - 5} x2={point.x + 5} y2={point.y + 5} />
                <line x1={point.x - 5} y1={point.y + 5} x2={point.x + 5} y2={point.y - 5} />
              </g>
            ) : (
              <circle cx={point.x} cy={point.y} r={visual.marker === 'six' ? 5 : 4} fill={visual.color} />
            )}
          </g>
        )
      })}
    </g>
  )
}
