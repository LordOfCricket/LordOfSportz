import StatTile from './StatTile.jsx'

export default function FieldingStatsPanel({ fielding, light = false }) {
  return (
    <div className="grid grid-cols-3 gap-3">
      <StatTile light={light} label="Catches" value={fielding.catches} emphasis />
      <StatTile light={light} label="Run Outs" value={fielding.runOuts} />
      <StatTile light={light} label="Stumpings" value={fielding.stumpings} />
    </div>
  )
}
