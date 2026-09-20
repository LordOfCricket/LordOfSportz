// Centralized public match-discovery labels/formatting: every surface
// (MatchCard, MatchesPage, homepage previews) imports from here instead of
// re-deriving its own status text. Mirrors the same four labels
// MatchHero.jsx already established, kept as an independent copy here (this
// is presentation text for the NEW discovery surfaces, not a change to the
// existing Match Summary read model).

export const STATUS_LABEL = {
  upcoming: 'Upcoming',
  live: 'Live',
  completed: 'Awaiting Finalization',
  finalized: 'Official Result',
  cancelled: 'Cancelled',
}

export function statusLabel(match) {
  if (match.isInningsBreak) return 'Innings Break'
  return STATUS_LABEL[match.status] || match.status
}

export const CATEGORIES = [
  { key: 'LIVE', label: 'Live' },
  { key: 'UPCOMING', label: 'Upcoming' },
  { key: 'RESULTS', label: 'Results' },
]

export function formatMatchDate(dateStr) {
  return new Date(dateStr).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })
}

export function formatMatchTime(dateStr) {
  return new Date(dateStr).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

export function formatOversFormat(oversPerInnings) {
  return oversPerInnings != null ? `${oversPerInnings} overs` : null
}

// One source of truth for "Team X won by Y" / "Match Tied" (previously
// inlined only in MatchHero.jsx) — result.text is the backend's own
// pre-formatted margin string (domain/scoring/matchResult.js::
// deriveMatchResult, e.g. "won by 7 wickets"/"won by 12 runs"), this only
// decides which team name prefixes it, or returns the tie text as-is.
export function formatMatchResultLine(result, teamA, teamB) {
  if (!result) return null
  if (result.resultType === 'TIE') return result.text
  const winnerName = result.winnerTeamId === teamA.id ? teamA.name : teamB.name
  return `${winnerName} ${result.text.charAt(0).toLowerCase()}${result.text.slice(1)}`
}
