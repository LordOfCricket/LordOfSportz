import { useNavigate } from 'react-router-dom'

function formatDateTime(dateStr) {
  return new Date(dateStr).toLocaleString(undefined, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function PlayingXiList({ title, entries }) {
  const navigate = useNavigate()
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-loc-faint">{title}</p>
      <ul className="mt-2 space-y-1.5">
        {entries.map((e) => (
          <li key={e.player.publicPlayerId}>
            <button
              type="button"
              onClick={() => e.player.publicPlayerId && navigate(`/players/${e.player.publicPlayerId}`)}
              className="text-sm text-loc-muted hover:text-loc-green"
            >
              {e.player.name}
              {e.isCaptain && <span className="ml-1 text-xs font-bold text-amber-700">(C)</span>}
              {e.isWicketkeeper && <span className="ml-1 text-xs font-bold text-sky-300">(WK)</span>}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default function MatchInfoPanel({ summary }) {
  const { match, teams, toss, result, playingXi } = summary

  return (
    <div className="space-y-4">
      <div className="rounded-[1.5rem] border border-loc-border bg-loc-surface p-4 shadow-sm backdrop-blur-sm sm:p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-loc-faint">Match Info</p>
        <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <div className="flex justify-between sm:block">
            <dt className="text-loc-faint">Date</dt>
            <dd className="text-loc-muted">{formatDateTime(match.matchDate)}</dd>
          </div>
          {match.venue && (
            <div className="flex justify-between sm:block">
              <dt className="text-loc-faint">Venue</dt>
              <dd className="text-loc-muted">{match.venue}</dd>
            </div>
          )}
          <div className="flex justify-between sm:block">
            <dt className="text-loc-faint">Overs</dt>
            <dd className="text-loc-muted">{match.oversPerInnings ?? 'Unlimited'}</dd>
          </div>
          <div className="flex justify-between sm:block">
            <dt className="text-loc-faint">Balls per Over</dt>
            <dd className="text-loc-muted">{match.ballsPerOver}</dd>
          </div>
          {toss && (
            <div className="flex justify-between sm:col-span-2 sm:block">
              <dt className="text-loc-faint">Toss</dt>
              <dd className="text-loc-muted">{toss.text}</dd>
            </div>
          )}
          {result && (
            <div className="flex justify-between sm:col-span-2 sm:block">
              <dt className="text-loc-faint">Result</dt>
              <dd className="text-loc-muted">{result.text}</dd>
            </div>
          )}
        </dl>
      </div>

      {(playingXi.teamA.length > 0 || playingXi.teamB.length > 0) && (
        <div className="rounded-[1.5rem] border border-loc-border bg-loc-surface p-4 shadow-sm backdrop-blur-sm sm:p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-loc-faint">Playing XI</p>
          <div className="mt-3 grid grid-cols-1 gap-6 sm:grid-cols-2">
            <PlayingXiList title={teams.teamA.name} entries={playingXi.teamA} />
            <PlayingXiList title={teams.teamB.name} entries={playingXi.teamB} />
          </div>
        </div>
      )}
    </div>
  )
}
