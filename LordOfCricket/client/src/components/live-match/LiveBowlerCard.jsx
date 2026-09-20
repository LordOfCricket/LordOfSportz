// Before any ball has been bowled in the
// innings, `bowler` is null — shown honestly as "Awaiting next bowler"
// rather than crashing or displaying a stale previous bowler.
export default function LiveBowlerCard({ bowler }) {
  return (
    <div className="rounded-2xl bg-white/5 p-3">
      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Bowler</p>
      {bowler ? (
        <div className="mt-1 flex items-center justify-between gap-2">
          <p className="min-w-0 truncate text-sm font-semibold text-white">{bowler.player.name}</p>
          <p className="shrink-0 text-sm text-slate-300">
            {bowler.oversLabel}-{bowler.runs}-{bowler.wickets}
            <span className="ml-1.5 text-xs text-slate-500">Econ {bowler.economy != null ? bowler.economy.toFixed(2) : '—'}</span>
          </p>
        </div>
      ) : (
        <p className="mt-1 text-sm text-slate-400">Awaiting next bowler...</p>
      )}
    </div>
  )
}
