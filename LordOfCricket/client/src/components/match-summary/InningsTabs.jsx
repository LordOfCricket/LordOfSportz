export default function InningsTabs({ summary, activeInningsId, onSelect }) {
  const { innings, teams } = summary
  if (innings.length < 2) return null

  return (
    <div className="flex gap-1 overflow-x-auto rounded-full border border-loc-border bg-loc-surface p-1">
      {innings.map((inn) => {
        const team = inn.battingTeamId === teams.teamA.id ? teams.teamA : teams.teamB
        return (
          <button
            key={inn.inningsId}
            type="button"
            onClick={() => onSelect(inn.inningsId)}
            className={`shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-xs font-bold transition-colors ${
              activeInningsId === inn.inningsId ? 'bg-loc-green text-loc-navy' : 'text-loc-muted hover:bg-loc-mint'
            }`}
          >
            {team.name} {inn.score.runs}/{inn.score.wickets}
          </button>
        )
      })}
    </div>
  )
}
