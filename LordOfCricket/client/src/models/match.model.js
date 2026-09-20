// Real match setup helpers. Display/setup-time convenience only:
// nothing here participates in scoring replay (that stays server-only, see
// scoringApi.js). Deriving "who bats first" from a toss result already on the
// match record is trivial bookkeeping, not a cricket-rules decision.
export function battingTeamIdFromToss(match) {
  if (!match?.toss_winner_id || !match?.toss_decision) return null
  const otherTeamId = match.toss_winner_id === match.team_a_id ? match.team_b_id : match.team_a_id
  return match.toss_decision === 'bat' ? match.toss_winner_id : otherTeamId
}

export function bowlingTeamIdFromToss(match) {
  const battingTeamId = battingTeamIdFromToss(match)
  if (!battingTeamId) return null
  return battingTeamId === match.team_a_id ? match.team_b_id : match.team_a_id
}
