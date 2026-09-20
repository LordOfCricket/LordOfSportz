// State-dependent next action for the match operations list (scorer
// discoverability). A match's status alone decides where "open this
// match" should navigate; nothing here recomputes match state itself.
export function matchActionForStatus(match) {
  switch (match.status) {
    case 'upcoming':
      return { label: 'Setup Match', to: `/matches/${match.id}/setup` }
    case 'live':
      return { label: 'Open Scorer', to: `/matches/${match.id}/setup` }
    case 'completed':
      return { label: 'Review / Finalize', to: `/matches/${match.id}/setup` }
    case 'finalized':
      return { label: 'View Result', to: `/matches/${match.id}/summary` }
    default:
      return { label: 'Open', to: `/matches/${match.id}/setup` }
  }
}
