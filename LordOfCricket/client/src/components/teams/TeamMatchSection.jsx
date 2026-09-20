import MatchCard from '../matches/MatchCard.jsx'

// Reuses the exact same MatchCard/
// DTO, never a forked team-specific match card with different result semantics.
export default function TeamMatchSection({ title, matches, emptyMessage, light = false }) {
  return (
    <div>
      <h2 className={`text-lg font-bold ${light ? "text-loc-navy" : "text-white"}`}>{title}</h2>
      {matches.length === 0 ? (
        <p className={`mt-3 rounded-2xl border border-dashed px-6 py-6 text-center text-sm ${light ? "border-loc-border bg-loc-mint text-loc-muted" : "border-white/10 bg-white/5 text-slate-300"}`}>{emptyMessage}</p>
      ) : (
        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {matches.map((m) => (
            <MatchCard key={m.id} match={m} light={light} />
          ))}
        </div>
      )}
    </div>
  )
}
