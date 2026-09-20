import { useRef, useState } from 'react'
import { GROUND, resolveShot } from '../../models/wagonWheel.model.js'
import CricketGround from './CricketGround.jsx'
import FieldRegions from './FieldRegions.jsx'
import ShotLines from './ShotLines.jsx'
import CurrentShot from './CurrentShot.jsx'

export default function WagonWheel({ actions, pendingShot, onSelectShot }) {
  const svgRef = useRef(null)
  const [hoveredRegionId, setHoveredRegionId] = useState(null)

  const handlePointerDown = (event) => {
    const svg = svgRef.current
    if (!svg) return

    const rect = svg.getBoundingClientRect()
    const scale = GROUND.viewBox / rect.width
    const svgX = (event.clientX - rect.left) * scale
    const svgY = (event.clientY - rect.top) * scale

    const shot = resolveShot(svgX - GROUND.cx, svgY - GROUND.cy)
    if (shot) onSelectShot(shot)
  }

  // Hover highlight is desktop-only; touch gets feedback via the selected-shot highlight instead.
  const handleHover = (regionId, event) => {
    if (event && event.pointerType !== 'mouse') return
    setHoveredRegionId(regionId)
  }

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${GROUND.viewBox} ${GROUND.viewBox}`}
      className="h-full w-full touch-none select-none cursor-crosshair"
      onPointerDown={handlePointerDown}
      role="img"
      aria-label="Cricket wagon wheel — tap to select a shot direction"
    >
      <CricketGround />
      <FieldRegions
        hoveredRegionId={hoveredRegionId}
        selectedRegionId={pendingShot?.regionId}
        onHover={handleHover}
      />
      <ShotLines actions={actions} />
      <CurrentShot shot={pendingShot} />
    </svg>
  )
}
