// Phase 17 — Match Analytics. Reuses matchSummary.service.js#getMatchSummary
// (Phase 9, unmodified) for teams/result/partnerships/fall-of-wickets, and
// makes its OWN bounded, single-match replay pass (scoring.service.js#
// getInningsState — the same trusted function, never a new engine) to get
// the raw delivery array score/phase/progression analytics need that the
// scorecard read model doesn't expose. Bounded to exactly this one match's
// innings (at most 2 replays) — never a factor in the N+1-across-many-matches
// concern Part 46 warns about.

import { findMatchByIdWithTeams } from '../models/match.model.js'
import * as scoringService from './scoring.service.js'
import * as matchSummaryService from './matchSummary.service.js'
import { buildScoreProgression, attachRequiredRunRate } from '../domain/analytics/inningsProgression.js'
import { buildScoreComparisonSeries } from '../domain/analytics/scoreComparison.js'
import { buildPhaseMetrics } from '../domain/analytics/phaseMetrics.js'

function notFound(message) {
  const err = new Error(message)
  err.statusCode = 404
  return err
}

function pickHighestPartnership(partnerships) {
  if (!partnerships || partnerships.length === 0) return null
  return partnerships.reduce((best, p) => (!best || p.runs > best.runs ? p : best), null)
}

export async function getMatchAnalytics(matchId) {
  const match = await findMatchByIdWithTeams(matchId)
  if (!match) throw notFound('Match not found.')

  const inningsRows = await scoringService.listInningsByMatch(matchId)
  if (inningsRows.length === 0) {
    return { available: false, reason: 'INSUFFICIENT_DATA' }
  }

  const summary = await matchSummaryService.getMatchSummary(matchId)
  const innings = []
  for (const inningsRow of inningsRows) {
    const result = await scoringService.getInningsState(inningsRow.id)
    if (!result) continue
    const { state, format } = result
    const summaryInnings = summary.innings.find((i) => i.inningsId === inningsRow.id)

    let progression = buildScoreProgression(state.deliveries, format.ballsPerOver)
    progression = attachRequiredRunRate(progression, format.target ?? null, format.oversPerInnings, format.ballsPerOver)
    const phaseMetrics = buildPhaseMetrics(state.deliveries, format.oversPerInnings, format.ballsPerOver)
    const highestPartnership = pickHighestPartnership(summaryInnings?.partnerships)

    innings.push({
      inningsId: inningsRow.id,
      inningsNumber: inningsRow.innings_number,
      battingTeamId: inningsRow.batting_team_id,
      bowlingTeamId: inningsRow.bowling_team_id,
      progression,
      phaseMetrics,
      highestPartnership,
    })
  }

  let scoreComparison = null
  if (innings.length === 2) {
    scoreComparison = buildScoreComparisonSeries(innings[0].progression, innings[0].battingTeamId, innings[1].progression, innings[1].battingTeamId)
  }

  return {
    available: true,
    match: { id: match.id, status: match.status, isOfficial: match.status === 'finalized' },
    teams: { teamA: { id: match.team_a_id, name: match.team_a_name }, teamB: { id: match.team_b_id, name: match.team_b_name } },
    innings,
    scoreComparison,
  }
}
