import { useState } from 'react'
import WagonWheel from '../wagon-wheel/WagonWheel.jsx'

const NOOP = () => {}

export default function WagonWheelSection({ innings }) {
  const batters = [...new Map(innings.wagonWheel.map((s) => [s.player.publicPlayerId, s.player])).values()]
  const [selected, setSelected] = useState('')

  if (innings.wagonWheel.length === 0) {
    return (
      <div className="rounded-[1.5rem] border border-loc-border bg-loc-surface p-5 text-center shadow-sm backdrop-blur-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-loc-faint">Wagon Wheel</p>
        <p className="mt-3 text-sm text-loc-faint">No wagon wheel data recorded for this innings.</p>
      </div>
    )
  }

  const shots = selected ? innings.wagonWheel.filter((s) => s.player.publicPlayerId === selected) : innings.wagonWheel
  const summary = shots.reduce(
    (acc, s) => ({ runs: acc.runs + s.runs, fours: acc.fours + (s.runs === 4 ? 1 : 0), sixes: acc.sixes + (s.runs === 6 ? 1 : 0) }),
    { runs: 0, fours: 0, sixes: 0 }
  )

  return (
    <div className="rounded-[1.5rem] border border-loc-border bg-loc-surface p-5 shadow-sm backdrop-blur-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-loc-faint">Wagon Wheel</p>
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="rounded-xl loc-card px-3 py-1.5 text-xs text-loc-navy focus:border-loc-green focus:outline-none"
        >
          <option value="" className="bg-loc-surface">All Batters</option>
          {batters.map((b) => (
            <option key={b.publicPlayerId} value={b.publicPlayerId} className="bg-loc-surface">
              {b.name}
            </option>
          ))}
        </select>
      </div>

      <div className="mx-auto mt-3 aspect-square w-full max-w-md">
        <WagonWheel actions={shots} pendingShot={null} onSelectShot={NOOP} />
      </div>

      <p className="mt-3 text-center text-xs font-semibold text-loc-muted">
        Runs: {summary.runs} · 4s: {summary.fours} · 6s: {summary.sixes}
      </p>
    </div>
  )
}
