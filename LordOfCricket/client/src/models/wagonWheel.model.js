// Geometry + cricket domain rules for the wagon wheel. Kept UI-free so the
// field-zone mapping can be tuned independently of the rendering components.

export const GROUND = {
  viewBox: 600,
  cx: 300,
  cy: 300,
  boundaryRadius: 260,
  infieldRadius: 155,
  pitchTopY: 150,
  pitchWidth: 16,
  minSelectRadius: 14, // taps closer than this to the batsman are ignored (ambiguous angle)
  deepThreshold: 0.6, // normalized distance beyond which a region becomes "Deep ..."
}

// Angle convention: 0deg points from the batsman straight up the pitch toward
// the bowler, increasing clockwise. 0-180deg is the batsman's right (leg side
// for a right-handed batsman), 180-360deg is the left (off side).
export const FIELD_REGIONS = [
  { id: 'long-on', base: 'Long On', side: 'leg', hasDepth: false, startAngle: 0, endAngle: 45 },
  { id: 'mid-wicket', base: 'Mid Wicket', side: 'leg', hasDepth: true, startAngle: 45, endAngle: 90 },
  { id: 'square-leg', base: 'Square Leg', side: 'leg', hasDepth: true, startAngle: 90, endAngle: 135 },
  { id: 'fine-leg', base: 'Fine Leg', side: 'leg', hasDepth: false, startAngle: 135, endAngle: 180 },
  { id: 'third-man', base: 'Third Man', side: 'off', hasDepth: false, startAngle: 180, endAngle: 225 },
  { id: 'point', base: 'Point', side: 'off', hasDepth: true, startAngle: 225, endAngle: 270 },
  { id: 'cover', base: 'Cover', side: 'off', hasDepth: true, startAngle: 270, endAngle: 315 },
  { id: 'long-off', base: 'Long Off', side: 'off', hasDepth: false, startAngle: 315, endAngle: 360 },
]

export function polarToCartesian(cx, cy, r, angleDeg) {
  const rad = (angleDeg * Math.PI) / 180
  return { x: cx + r * Math.sin(rad), y: cy - r * Math.cos(rad) }
}

export function describeWedgePath(cx, cy, radius, startAngle, endAngle) {
  const start = polarToCartesian(cx, cy, radius, startAngle)
  const end = polarToCartesian(cx, cy, radius, endAngle)
  return `M ${cx} ${cy} L ${start.x} ${start.y} A ${radius} ${radius} 0 0 1 ${end.x} ${end.y} Z`
}

function angleFromOffset(dx, dy) {
  const deg = (Math.atan2(dx, -dy) * 180) / Math.PI
  return (deg + 360) % 360
}

export function getShotRegion(angle) {
  const normalized = ((angle % 360) + 360) % 360
  return FIELD_REGIONS.find((region) => normalized >= region.startAngle && normalized < region.endAngle) || FIELD_REGIONS[0]
}

/** Converts a raw SVG-space offset from the batsman into a normalized, resolution-independent shot. */
export function resolveShot(dx, dy) {
  const dist = Math.hypot(dx, dy)
  if (dist < GROUND.minSelectRadius) return null

  const ratio = Math.min(dist, GROUND.boundaryRadius) / dist
  const nx = (dx * ratio) / GROUND.boundaryRadius
  const ny = (dy * ratio) / GROUND.boundaryRadius
  const angle = angleFromOffset(dx, dy)
  const normalizedDist = Math.min(dist, GROUND.boundaryRadius) / GROUND.boundaryRadius
  const region = getShotRegion(angle)
  const label = region.hasDepth && normalizedDist > GROUND.deepThreshold ? `Deep ${region.base}` : region.base

  return { x: nx, y: ny, angle, regionId: region.id, region: label, side: region.side }
}

export function shotToPoint(shot) {
  return { x: GROUND.cx + shot.x * GROUND.boundaryRadius, y: GROUND.cy + shot.y * GROUND.boundaryRadius }
}

export const RUN_BUTTONS = [
  { runs: 0, emphasis: false },
  { runs: 1, emphasis: true },
  { runs: 2, emphasis: true },
  { runs: 3, emphasis: false },
  { runs: 4, emphasis: true },
  { runs: 5, emphasis: false },
  { runs: 6, emphasis: true },
]

export function getShotVisual(action) {
  if (action.outcome === 'wicket') return { color: '#f43f5e', width: 3, marker: 'wicket' }
  if (action.runs === 6) return { color: '#c084fc', width: 3.5, marker: 'six' }
  if (action.runs === 4) return { color: '#fbbf24', width: 3, marker: 'boundary' }
  return { color: 'rgba(226,232,240,0.55)', width: 2, marker: 'dot' }
}

