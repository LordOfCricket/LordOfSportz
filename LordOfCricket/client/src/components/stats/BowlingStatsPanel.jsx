import StatTile from './StatTile.jsx'

function formatBest(bestBowling) {
  if (!bestBowling) return null
  return `${bestBowling.wickets}/${bestBowling.runs}`
}

export default function BowlingStatsPanel({ bowling, light = false }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile light={light} label="Innings" value={bowling.innings} />
        <StatTile light={light} label="Wickets" value={bowling.wickets} emphasis />
        {/* Career workload spans matches that may use different balls-per-over,
            so it's shown as an exact legal-ball count rather than
            an "overs" string that would silently assume six-ball overs. */}
        <StatTile light={light} label="Legal Balls" value={bowling.legalBalls} />
        <StatTile light={light} label="Maidens" value={bowling.maidens} />
        <StatTile light={light} label="Runs Conceded" value={bowling.runsConceded} />
        <StatTile light={light} label="Best" value={formatBest(bowling.bestBowling)} emphasis />
        <StatTile light={light} label="Average" value={bowling.average} />
        <StatTile light={light} label="Economy" value={bowling.economy} />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile light={light} label="Strike Rate" value={bowling.strikeRate} />
        <StatTile light={light} label="3W" value={bowling.threeWicketHauls} />
        <StatTile light={light} label="4W" value={bowling.fourWicketHauls} />
        <StatTile light={light} label="5W" value={bowling.fiveWicketHauls} />
      </div>
    </div>
  )
}
