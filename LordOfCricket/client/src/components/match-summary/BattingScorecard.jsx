import { useNavigate } from 'react-router-dom'

function statusText(row) {
  if (row.status === 'DNB') return 'Did Not Bat'
  if (row.status === 'YTB') return 'Yet to Bat'
  return row.dismissalText
}

export default function BattingScorecard({ innings }) {
  const navigate = useNavigate()
  const active = innings.batting.filter((r) => r.status === 'NOT_OUT' || r.status === 'OUT')
  const dnb = innings.batting.filter((r) => r.status === 'DNB')
  const ytb = innings.batting.filter((r) => r.status === 'YTB')

  return (
    <div className="rounded-[1.5rem] border border-loc-border bg-loc-surface p-4 shadow-sm backdrop-blur-sm sm:p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-loc-faint">Batting</p>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[420px] text-sm">
          <thead>
            <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-loc-faint">
              <th className="pb-2">Batter</th>
              <th className="pb-2 text-right">R</th>
              <th className="pb-2 text-right">B</th>
              <th className="pb-2 text-right">4s</th>
              <th className="pb-2 text-right">6s</th>
              <th className="pb-2 text-right">SR</th>
            </tr>
          </thead>
          <tbody>
            {active.map((row) => (
              <tr key={row.player.publicPlayerId} className="border-t border-loc-border">
                <td className="py-2 pr-2">
                  <button
                    type="button"
                    onClick={() => row.player.publicPlayerId && navigate(`/players/${row.player.publicPlayerId}`)}
                    className="text-left font-semibold text-loc-navy hover:text-loc-green"
                  >
                    {row.player.name}
                  </button>
                  <p className="text-xs text-loc-faint">{statusText(row)}</p>
                </td>
                <td className="py-2 text-right font-bold text-loc-navy">{row.runs}</td>
                <td className="py-2 text-right text-loc-muted">{row.balls}</td>
                <td className="py-2 text-right text-loc-muted">{row.fours}</td>
                <td className="py-2 text-right text-loc-muted">{row.sixes}</td>
                <td className="py-2 text-right text-loc-muted">{row.strikeRate?.toFixed(2) ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-loc-border pt-3 text-sm">
        <span className="text-loc-muted">
          Extras {innings.extras.total}
          <span className="text-xs text-loc-faint">
            {' '}
            (w {innings.extras.wides}, nb {innings.extras.noBalls}, b {innings.extras.byes}, lb {innings.extras.legByes})
          </span>
        </span>
      </div>
      <div className="mt-2 flex items-center justify-between text-sm font-bold text-loc-navy">
        <span>Total</span>
        <span>
          {innings.total.runs}/{innings.total.wickets} ({innings.total.oversLabel} ov, RR {innings.total.runRate.toFixed(2)})
        </span>
      </div>

      {ytb.length > 0 && (
        <div className="mt-4 border-t border-loc-border pt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-loc-faint">Yet to Bat</p>
          <p className="mt-1 text-sm text-loc-muted">{ytb.map((r) => r.player.name).join(', ')}</p>
        </div>
      )}
      {dnb.length > 0 && (
        <div className="mt-4 border-t border-loc-border pt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-loc-faint">Did Not Bat</p>
          <p className="mt-1 text-sm text-loc-muted">{dnb.map((r) => r.player.name).join(', ')}</p>
        </div>
      )}
    </div>
  )
}
