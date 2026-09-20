// Phase 16 Part 8/16/42 — a pure, deterministic, bounded projection of the
// PUBLIC Match Summary DTO (matchSummary.service.js#getMatchSummary) plus a
// deterministic list of "key moment" candidates (Part 10/11) into the
// compact fact-set the AI is allowed to see. Zero pg/I/O — everything here
// is already-fetched data, matching "provider prompt code should not query
// PostgreSQL itself."
//
// Never re-derives cricket truth: every number here is read straight off the
// summary DTO's own fields (which are themselves replay-derived — see
// buildInningsSummary.js). This module only selects/bounds/labels.
//
// Candidate key moments are NOT invented here either — they come from the
// existing Phase 12 deterministic commentary projection
// (`commentary_entries`), filtered to WICKET/MILESTONE rows and FOUR/SIX
// boundary deliveries — the AI explains a supplied candidate, it never
// invents a delivery/event (Part 10/11). Each candidate gets a stable,
// application-assigned `candidateId` ("km-1", "km-2", ...) — the schema only
// ever asks the AI to reference this id, never a raw database id, so the AI
// can never fabricate a deliveryId (Part 11/48).

const MAX_TOP_PERFORMERS = 3
const MAX_CANDIDATE_MOMENTS = 15

function topBatters(innings) {
  return [...innings.batting]
    .filter((b) => b.runs != null)
    .sort((a, b) => b.runs - a.runs)
    .slice(0, MAX_TOP_PERFORMERS)
    .map((b) => ({ publicPlayerId: b.player.publicPlayerId, name: b.player.name, runs: b.runs, balls: b.balls, fours: b.fours, sixes: b.sixes, status: b.status }))
}

function topBowlers(innings) {
  return [...innings.bowling]
    .filter((b) => b.wickets != null)
    .sort((a, b) => b.wickets - a.wickets || a.runs - b.runs)
    .slice(0, MAX_TOP_PERFORMERS)
    .map((b) => ({ publicPlayerId: b.player.publicPlayerId, name: b.player.name, oversLabel: b.oversLabel, runs: b.runs, wickets: b.wickets, economy: b.economy }))
}

/** @param commentaryRows - raw commentary_entries rows (match-wide, sequence order) */
function buildCandidateKeyMoments(commentaryRows) {
  const relevant = commentaryRows.filter((r) => r.type === 'WICKET' || r.type === 'MILESTONE' || (r.type === 'DELIVERY' && (r.tags || []).some((t) => t === 'FOUR' || t === 'SIX')))
  return relevant.slice(0, MAX_CANDIDATE_MOMENTS).map((r, i) => ({
    candidateId: `km-${i + 1}`,
    type: r.type,
    inningsNumber: r.innings_number ?? r.inningsNumber ?? null,
    ballLabel: r.ball_label ?? r.ballLabel ?? null,
    label: r.text,
    deliveryId: r.source_delivery_id ?? r.sourceDeliveryId ?? null,
    eventId: r.source_event_id ?? r.sourceEventId ?? null,
  }))
}

/**
 * @param {object} summary - matchSummary.service.js#getMatchSummary's DTO
 * @param {Array} commentaryRows - raw commentary_entries rows for this match, sequence order
 */
export function buildMatchAIContext(summary, commentaryRows = []) {
  const allowedPlayerIds = new Set()
  const inningsFacts = summary.innings.map((inn) => {
    const battingTeam = inn.battingTeamId === summary.teams.teamA.id ? summary.teams.teamA : summary.teams.teamB
    const bowlingTeam = inn.bowlingTeamId === summary.teams.teamA.id ? summary.teams.teamA : summary.teams.teamB
    const batters = topBatters(inn)
    const bowlers = topBowlers(inn)
    for (const p of [...batters, ...bowlers]) if (p.publicPlayerId) allowedPlayerIds.add(p.publicPlayerId)
    return {
      inningsNumber: inn.inningsNumber,
      battingTeam: battingTeam.name,
      bowlingTeam: bowlingTeam.name,
      totalRuns: inn.total.runs,
      totalWickets: inn.total.wickets,
      oversLabel: inn.total.oversLabel,
      runRate: inn.total.runRate,
      endReason: inn.score.endReason,
      topBatters: batters,
      topBowlers: bowlers,
    }
  })

  const candidates = buildCandidateKeyMoments(commentaryRows)

  return {
    matchId: summary.match.id,
    isOfficial: summary.match.isOfficial,
    venue: summary.match.venue,
    matchDate: summary.match.matchDate,
    oversPerInnings: summary.match.oversPerInnings,
    ballsPerOver: summary.match.ballsPerOver,
    teamA: summary.teams.teamA.name,
    teamB: summary.teams.teamB.name,
    toss: summary.toss ? { winner: summary.toss.winnerTeamId === summary.teams.teamA.id ? summary.teams.teamA.name : summary.teams.teamB.name, decision: summary.toss.decision } : null,
    result: summary.result ? { resultType: summary.result.resultType, resultMargin: summary.result.resultMargin, text: summary.result.text, winnerTeamName: summary.result.winnerTeamId === summary.teams.teamA.id ? summary.teams.teamA.name : summary.result.winnerTeamId === summary.teams.teamB.id ? summary.teams.teamB.name : null } : null,
    innings: inningsFacts,
    candidateKeyMoments: candidates,
    allowedPlayerIds: [...allowedPlayerIds],
    tournament: summary.tournamentContext
      ? { name: summary.tournamentContext.name, stage: summary.tournamentContext.stage, groupName: summary.tournamentContext.groupName }
      : null,
  }
}
