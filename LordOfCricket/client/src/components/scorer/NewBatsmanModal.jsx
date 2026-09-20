export default function NewBatsmanModal({ open, end, eligiblePlayers, onSelect }) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-emerald-950 p-6">
        <h2 className="text-lg font-bold text-white">Select Next Batsman</h2>
        <p className="mt-1 text-sm text-slate-400">{end === 'strikerEnd' ? 'Coming in to strike' : 'Coming in at the non-striker end'}</p>
        <div className="mt-4 max-h-96 space-y-2 overflow-y-auto">
          {eligiblePlayers.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onSelect(p.id)}
              className="flex min-h-14 w-full items-center rounded-xl border border-white/10 bg-white/5 px-4 text-left text-sm font-semibold text-white transition-colors hover:bg-white/10"
            >
              {p.name}
            </button>
          ))}
          {eligiblePlayers.length === 0 && <p className="text-sm text-slate-400">No eligible batsmen remaining.</p>}
        </div>
      </div>
    </div>
  )
}
