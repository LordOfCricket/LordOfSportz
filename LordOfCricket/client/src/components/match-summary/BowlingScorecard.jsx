import { useNavigate } from 'react-router-dom'

export default function BowlingScorecard({ innings }) {
  const navigate = useNavigate()
  if (innings.bowling.length === 0) {
    return (
      <div className="rounded-[1.5rem] border border-loc-border bg-loc-surface p-4 shadow-sm backdrop-blur-sm sm:p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-loc-faint">Bowling</p>
        <p className="mt-3 text-sm text-loc-faint">Nobody has bowled yet.</p>
      </div>
    )
  }

  return (
    <div className="rounded-[1.5rem] border border-loc-border bg-loc-surface p-4 shadow-sm backdrop-blur-sm sm:p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-loc-faint">Bowling</p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[420px] text-sm">
          <thead>
            <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-loc-faint">
              <th className="pb-2">Bowler</th>
              <th className="pb-2 text-right">O</th>
              <th className="pb-2 text-right">M</th>
              <th className="pb-2 text-right">R</th>
              <th className="pb-2 text-right">W</th>
              <th className="pb-2 text-right">Econ</th>
            </tr>
          </thead>
          <tbody>
            {innings.bowling.map((row) => (
              <tr key={row.player.publicPlayerId} className="border-t border-loc-border">
                <td className="py-2 pr-2">
                  <button
                    type="button"
                    onClick={() => row.player.publicPlayerId && navigate(`/players/${row.player.publicPlayerId}`)}
                    className="text-left font-semibold text-loc-navy hover:text-loc-green"
                  >
                    {row.player.name}
                  </button>
                  {(row.wides > 0 || row.noBalls > 0) && (
                    <p className="text-xs text-loc-faint">
                      wd {row.wides}, nb {row.noBalls}
                    </p>
                  )}
                </td>
                <td className="py-2 text-right text-loc-muted">{row.oversLabel}</td>
                <td className="py-2 text-right text-loc-muted">{row.maidens}</td>
                <td className="py-2 text-right text-loc-muted">{row.runs}</td>
                <td className="py-2 text-right font-bold text-loc-navy">{row.wickets}</td>
                <td className="py-2 text-right text-loc-muted">{row.economy?.toFixed(2) ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
