export default function PartnershipsPanel({ innings }) {
  if (innings.partnerships.length === 0) return null

  return (
    <div className="rounded-[1.5rem] border border-loc-border bg-loc-surface p-4 shadow-sm backdrop-blur-sm sm:p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-loc-faint">Partnerships</p>
      <div className="mt-3 space-y-2">
        {innings.partnerships.map((p, i) => (
          <div key={i} className="flex items-center justify-between rounded-xl bg-loc-mint px-3 py-2 text-sm">
            <span className="text-loc-muted">
              {p.batsmen.map((b) => b.name).join(' & ')}
              {p.unbeaten && <span className="ml-1 text-xs text-loc-green">(unbeaten)</span>}
            </span>
            <span className="font-semibold text-loc-navy">
              {p.runs} <span className="text-xs text-loc-faint">({p.balls} balls)</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
