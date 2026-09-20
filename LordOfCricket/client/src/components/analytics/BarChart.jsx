// A small, dependency-free CSS bar chart. Plain HTML/CSS (not
// SVG) so every value is a real, always-visible text label — never hidden
// behind a hover-only tooltip (don't rely on color/hover alone).

export default function BarChart({ data, formatValue = (v) => v, color = '#34d399', emptyLabel = 'No data yet.' }) {
  if (!data || data.length === 0) {
    return <p className="text-sm text-slate-400">{emptyLabel}</p>
  }
  const max = Math.max(...data.map((d) => d.value), 1)

  return (
    <div className="flex flex-col gap-2">
      {data.map((d) => (
        <div key={d.label} className="flex items-center gap-3">
          <span className="w-28 shrink-0 truncate text-xs text-slate-300" title={d.label}>
            {d.label}
          </span>
          <div className="h-3 flex-1 overflow-hidden rounded-full bg-white/5">
            <div className="h-full rounded-full" style={{ width: `${Math.max(2, (d.value / max) * 100)}%`, backgroundColor: d.color || color }} />
          </div>
          <span className="w-16 shrink-0 text-right text-xs font-semibold text-white">{formatValue(d.value)}</span>
        </div>
      ))}
    </div>
  )
}
