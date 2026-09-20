import { FIELD_REGIONS, GROUND, describeWedgePath, polarToCartesian } from '../../models/wagonWheel.model.js'

export default function FieldRegions({ hoveredRegionId, selectedRegionId, onHover }) {
  const { cx, cy, boundaryRadius } = GROUND

  return (
    <g>
      {FIELD_REGIONS.map((region) => {
        const isSelected = region.id === selectedRegionId
        const isHovered = region.id === hoveredRegionId && !isSelected

        return (
          <path
            key={region.id}
            d={describeWedgePath(cx, cy, boundaryRadius, region.startAngle, region.endAngle)}
            className={
              isSelected
                ? 'fill-emerald-300/20'
                : isHovered
                  ? 'fill-white/8'
                  : 'fill-transparent'
            }
            onPointerEnter={(event) => onHover?.(region.id, event)}
            onPointerLeave={(event) => onHover?.(null, event)}
          />
        )
      })}

      {/* Separator lines */}
      {FIELD_REGIONS.map((region) => {
        const p = polarToCartesian(cx, cy, boundaryRadius, region.startAngle)
        return (
          <line
            key={`sep-${region.id}`}
            x1={cx}
            y1={cy}
            x2={p.x}
            y2={p.y}
            className="stroke-white/10"
            strokeWidth="1"
            pointerEvents="none"
          />
        )
      })}

      {/* Subtle region labels */}
      {FIELD_REGIONS.map((region) => {
        const mid = (region.startAngle + region.endAngle) / 2
        const p = polarToCartesian(cx, cy, boundaryRadius - 26, mid)
        return (
          <text
            key={`label-${region.id}`}
            x={p.x}
            y={p.y}
            textAnchor="middle"
            dominantBaseline="middle"
            className="fill-white/30 text-[10px] font-medium uppercase tracking-wide"
            pointerEvents="none"
          >
            {region.base}
          </text>
        )
      })}
    </g>
  )
}
