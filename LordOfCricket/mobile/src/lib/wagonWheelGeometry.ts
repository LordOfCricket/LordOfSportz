// Mobile port of client/src/models/wagonWheel.model.js geometry. Same angle
// convention (0deg = straight down the pitch toward the bowler, increasing
// clockwise; 0-180 = batsman's leg side for a RH batsman) and the same 8
// region ids the server validates (WAGON_WHEEL_REGION_IDS). Emits the exact
// shot shape POST /innings/:id/deliveries expects: { normalizedX,
// normalizedY, angleDegrees, regionId }. No scoring logic — placement only.

export const WHEEL = {
  size: 260, // logical px of the square wheel
  boundaryRadius: 120,
  infieldRadius: 72,
  minSelectRadius: 8,
  deepThreshold: 0.6,
}

interface Region {
  id: string
  base: string
  side: 'leg' | 'off'
  hasDepth: boolean
  startAngle: number
  endAngle: number
}

export const FIELD_REGIONS: Region[] = [
  { id: 'long-on', base: 'Long On', side: 'leg', hasDepth: false, startAngle: 0, endAngle: 45 },
  { id: 'mid-wicket', base: 'Mid Wicket', side: 'leg', hasDepth: true, startAngle: 45, endAngle: 90 },
  { id: 'square-leg', base: 'Square Leg', side: 'leg', hasDepth: true, startAngle: 90, endAngle: 135 },
  { id: 'fine-leg', base: 'Fine Leg', side: 'leg', hasDepth: false, startAngle: 135, endAngle: 180 },
  { id: 'third-man', base: 'Third Man', side: 'off', hasDepth: false, startAngle: 180, endAngle: 225 },
  { id: 'point', base: 'Point', side: 'off', hasDepth: true, startAngle: 225, endAngle: 270 },
  { id: 'cover', base: 'Cover', side: 'off', hasDepth: true, startAngle: 270, endAngle: 315 },
  { id: 'long-off', base: 'Long Off', side: 'off', hasDepth: false, startAngle: 315, endAngle: 360 },
]

function angleFromOffset(dx: number, dy: number): number {
  const deg = (Math.atan2(dx, -dy) * 180) / Math.PI
  return (deg + 360) % 360
}

export function getShotRegion(angle: number): Region {
  const n = ((angle % 360) + 360) % 360
  return FIELD_REGIONS.find((r) => n >= r.startAngle && n < r.endAngle) || FIELD_REGIONS[0]
}

export interface ResolvedShot {
  normalizedX: number
  normalizedY: number
  angleDegrees: number
  regionId: string
  label: string
  side: 'leg' | 'off'
}

/** dx/dy = tap offset from the wheel centre (batsman), in logical px. */
export function resolveShot(dx: number, dy: number): ResolvedShot | null {
  const dist = Math.hypot(dx, dy)
  if (dist < WHEEL.minSelectRadius) return null

  const clamped = Math.min(dist, WHEEL.boundaryRadius)
  const ratio = clamped / dist
  const nx = (dx * ratio) / WHEEL.boundaryRadius
  const ny = (dy * ratio) / WHEEL.boundaryRadius
  const angle = angleFromOffset(dx, dy)
  const normalizedDist = clamped / WHEEL.boundaryRadius
  const region = getShotRegion(angle)
  const label = region.hasDepth && normalizedDist > WHEEL.deepThreshold ? `Deep ${region.base}` : region.base

  return {
    normalizedX: Number(nx.toFixed(4)),
    normalizedY: Number(ny.toFixed(4)),
    angleDegrees: Number(angle.toFixed(2)) % 360,
    regionId: region.id,
    label,
    side: region.side,
  }
}

export function shotToPoint(shot: { normalizedX: number; normalizedY: number }, centre: number) {
  return {
    x: centre + shot.normalizedX * WHEEL.boundaryRadius,
    y: centre + shot.normalizedY * WHEEL.boundaryRadius,
  }
}
