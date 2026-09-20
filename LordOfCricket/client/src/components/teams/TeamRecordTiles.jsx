// Official record tiles. Finalized-matches-only,
// computed server-side by domain/team/teamRecord.js — this component only formats.
function Tile({ label, value, light }) {
  return (
    <div className={`rounded-2xl px-3 py-4 text-center ${light ? "border border-loc-border bg-loc-mint" : "bg-white/5"}`}>
      <p className={`text-2xl font-extrabold ${light ? "text-loc-navy" : "text-white"}`}>{value}</p>
      <p className={`mt-1 text-[11px] font-semibold uppercase tracking-wide ${light ? "text-loc-faint" : "text-slate-400"}`}>{label}</p>
    </div>
  )
}

export default function TeamRecordTiles({ record, light = false }) {
  if (record.matches === 0) {
    return <p className={`rounded-2xl border border-dashed px-6 py-8 text-center text-sm ${light ? "border-loc-border bg-loc-mint text-loc-muted" : "border-white/10 bg-white/5 text-slate-300"}`}>No official results yet.</p>
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Tile light={light} label="Matches" value={record.matches} />
      <Tile light={light} label="Wins" value={record.wins} />
      <Tile light={light} label="Losses" value={record.losses} />
      <Tile light={light} label="Win %" value={record.winPercentage != null ? `${record.winPercentage.toFixed(1)}%` : '—'} />
      {record.ties > 0 && <Tile light={light} label="Ties" value={record.ties} />}
      {record.noResults > 0 && <Tile light={light} label="No Result" value={record.noResults} />}
    </div>
  )
}
