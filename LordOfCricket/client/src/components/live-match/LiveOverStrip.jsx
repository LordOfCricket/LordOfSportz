import { ballLabel, ballClass } from '../match-summary/ballChip.js'

// Reuses the EXACT same ball-chip
// convention the scorecard already established — no second delivery-
// display format invented for the live panel.
export default function LiveOverStrip({ title, deliveries }) {
  return (
    <div className="rounded-2xl bg-white/5 p-3">
      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{title}</p>
      {deliveries.length === 0 ? (
        <p className="mt-2 text-sm text-slate-400">No deliveries yet.</p>
      ) : (
        <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1">
          {deliveries.map((d) => (
            <span key={d.id} className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${ballClass(d)}`}>
              {ballLabel(d)}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
