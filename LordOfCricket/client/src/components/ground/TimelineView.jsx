const TYPE_STYLE = {
  BOOKING: { bg: 'bg-sky-500/70', label: 'text-sky-100' },
  BLOCK: { bg: 'bg-amber-500/70', label: 'text-amber-100' },
  MATCH: { bg: 'bg-emerald-500/70', label: 'text-emerald-100' },
  FREE: { bg: 'bg-white/5', label: 'text-slate-400' },
}

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true })
}

/** The ground's daily timeline, rendered as a proportional horizontal bar PLUS a readable list (never color-only). */
export default function TimelineView({ segments }) {
  if (!segments || segments.length === 0) return <p className="text-sm text-slate-400">No timeline data.</p>

  const start = new Date(segments[0].startTime).getTime()
  const end = new Date(segments[segments.length - 1].endTime).getTime()
  const totalMs = Math.max(1, end - start)

  return (
    <div>
      <div className="flex h-8 w-full overflow-hidden rounded-full border border-white/10" role="img" aria-label="Ground occupancy timeline">
        {segments.map((s, i) => {
          const widthPct = ((new Date(s.endTime).getTime() - new Date(s.startTime).getTime()) / totalMs) * 100
          const style = TYPE_STYLE[s.type] || TYPE_STYLE.FREE
          return <div key={i} title={`${s.label} (${formatTime(s.startTime)} – ${formatTime(s.endTime)})`} className={`h-full ${style.bg}`} style={{ width: `${widthPct}%` }} />
        })}
      </div>

      <div className="mt-3 flex flex-wrap gap-3 text-xs">
        {Object.entries({ BOOKING: 'Booking', BLOCK: 'Block/Maintenance', MATCH: 'Match', FREE: 'Free' }).map(([type, label]) => (
          <span key={type} className="inline-flex items-center gap-1.5 text-slate-300">
            <span className={`inline-block h-2.5 w-2.5 rounded-full ${TYPE_STYLE[type].bg}`} />
            {label}
          </span>
        ))}
      </div>

      <ul className="mt-4 flex flex-col gap-1.5">
        {segments.map((s, i) => {
          const style = TYPE_STYLE[s.type] || TYPE_STYLE.FREE
          return (
            <li key={i} className="flex items-center gap-3 rounded-lg border border-white/5 bg-white/5 px-3 py-2 text-sm">
              <span className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${style.bg}`} />
              <span className="w-36 shrink-0 font-mono text-xs text-slate-400">
                {formatTime(s.startTime)} – {formatTime(s.endTime)}
              </span>
              <span className={`truncate font-medium ${style.label}`}>{s.label}</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
