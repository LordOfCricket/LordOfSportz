// A small, dependency-free SVG line/worm chart. No chart library
// exists anywhere in this repo (audited before building this — see
// docs/ARCHITECTURE.md), and three simple line charts
// don't justify adding one. `viewBox`-based (never a fixed pixel width) so it
// scales to its container at any screen size, and every point carries an
// SVG <title> (native hover tooltip) plus a visually-hidden data table so the
// same values are available without relying on hover/color alone.

const WIDTH = 300
const HEIGHT = 140
const PAD = { top: 10, right: 10, bottom: 22, left: 6 }

function scale(value, min, max, outMin, outMax) {
  if (max === min) return (outMin + outMax) / 2
  return outMin + ((value - min) / (max - min)) * (outMax - outMin)
}

/** `series`: [{ label, color, points: [{x, y}] }] — x/y are numeric, x is typically "over". */
export default function LineChart({ series, formatY = (v) => v, xTickLabel = (x) => x, emptyLabel = 'No data yet.' }) {
  const allPoints = series.flatMap((s) => s.points)
  if (allPoints.length === 0) {
    return <p className="text-sm text-slate-400">{emptyLabel}</p>
  }

  const xs = allPoints.map((p) => p.x)
  const ys = allPoints.map((p) => p.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(0, ...ys)
  const maxY = Math.max(...ys, 1)

  const plotLeft = PAD.left
  const plotRight = WIDTH - PAD.right
  const plotTop = PAD.top
  const plotBottom = HEIGHT - PAD.bottom

  return (
    <div>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="h-auto w-full" role="img" aria-label="Line chart">
        <line x1={plotLeft} y1={plotBottom} x2={plotRight} y2={plotBottom} stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
        <line x1={plotLeft} y1={plotTop} x2={plotLeft} y2={plotBottom} stroke="rgba(255,255,255,0.15)" strokeWidth="1" />

        {series.map((s) => {
          const pts = s.points.map((p) => ({
            x: scale(p.x, minX, maxX, plotLeft, plotRight),
            y: scale(p.y, minY, maxY, plotBottom, plotTop),
            raw: p,
          }))
          const path = pts.map((p) => `${p.x},${p.y}`).join(' ')
          return (
            <g key={s.label}>
              <polyline points={path} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
              {pts.map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r="2.5" fill={s.color}>
                  <title>
                    {xTickLabel(p.raw.x)}: {formatY(p.raw.y)}
                  </title>
                </circle>
              ))}
            </g>
          )
        })}
      </svg>

      <div className="mt-2 flex flex-wrap gap-3">
        {series.map((s) => (
          <span key={s.label} className="inline-flex items-center gap-1.5 text-xs text-slate-300">
            <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
            {s.label}
          </span>
        ))}
      </div>

      {/* Visually-hidden data summary — the same values LineChart plots, for
          screen readers / non-hover access. Plain text, not a
          <table>: an auto-layout table's intrinsic content width can leak
          into the page's scrollable area even under sr-only's `overflow:
          hidden` (a real bug caught by the mobile/tablet E2E sweep — see
          docs/TECHNICAL_DEBT.md), a risk a single text node doesn't have. */}
      <p className="sr-only">
        {series.map((s) => `${s.label}: ${s.points.map((p) => `${xTickLabel(p.x)} ${formatY(p.y)}`).join(', ')}`).join('. ')}
      </p>
    </div>
  )
}
