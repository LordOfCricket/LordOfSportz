import StatTile from './StatTile.jsx'

function formatHighest(highestScore) {
  if (!highestScore) return null
  return `${highestScore.runs}${highestScore.notOut ? '*' : ''}`
}

export default function BattingStatsPanel({ matches, batting, light = false }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile light={light} label="Matches" value={matches} />
        <StatTile light={light} label="Innings" value={batting.innings} />
        <StatTile light={light} label="Not Outs" value={batting.notOuts} />
        <StatTile light={light} label="Runs" value={batting.runs} emphasis />
        <StatTile light={light} label="Balls Faced" value={batting.ballsFaced} />
        <StatTile light={light} label="Highest" value={formatHighest(batting.highestScore)} emphasis />
        <StatTile light={light} label="Average" value={batting.average} />
        <StatTile light={light} label="Strike Rate" value={batting.strikeRate} />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile light={light} label="4s" value={batting.fours} />
        <StatTile light={light} label="6s" value={batting.sixes} />
        <StatTile light={light} label="30s" value={batting.thirties} />
        <StatTile light={light} label="50s" value={batting.fifties} />
        <StatTile light={light} label="100s" value={batting.hundreds} />
        <StatTile light={light} label="Ducks" value={batting.ducks} />
      </div>
    </div>
  )
}
