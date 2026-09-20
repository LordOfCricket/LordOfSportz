export default function FallOfWicketsPanel({ innings }) {
  return (
    <div className="rounded-[1.5rem] border border-loc-border bg-loc-surface p-4 shadow-sm backdrop-blur-sm sm:p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-loc-faint">Fall of Wickets</p>
      {innings.fallOfWickets.length === 0 ? (
        <p className="mt-3 text-sm text-loc-faint">No wickets fell.</p>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          {innings.fallOfWickets.map((fow) => (
            <span key={fow.wicketNumber} className="rounded-lg bg-loc-mint px-2.5 py-1.5 text-xs text-loc-muted">
              <span className="font-bold text-loc-navy">{fow.wicketNumber}-{fow.score}</span> ({fow.player.name}, {fow.overBall})
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
