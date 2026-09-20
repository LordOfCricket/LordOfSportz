// Phase 10 Part 1 — pure derivation of ONE lightweight public match-card DTO
// from a single joined SQL row (matches + teams + innings 1/2 CACHE columns).
// No pg, no I/O, no replay: innings.runs/wickets/legal_balls are already the
// authoritative read-model columns replay.js writes back on every delivery/
// correction (see schema.sql's comment on the innings table) — reading them
// here is reuse of that same cache, not a second independently-computed
// truth. Deliberately NOT the full Phase 9 buildInningsSummary (Part 8: match
// list payload != full match summary payload) — no batting/bowling/overs/
// timeline/wagon-wheel, no per-card replay.
//
// Chase math reuses the exact same pure selectors.js functions Phase 9 uses
// (Part 9/73: React/list code never recalculates target/required-run-rate).

import { formatOvers, getBallsRemaining, calculateRequiredRunRate } from '../scoring/selectors.js'

function inningsCard(row, n, ballsPerOver) {
  if (row[`i${n}_id`] == null) return null
  return {
    inningsNumber: n,
    battingTeamId: row[`i${n}_batting_team_id`],
    runs: row[`i${n}_runs`],
    wickets: row[`i${n}_wickets`],
    oversLabel: formatOvers(row[`i${n}_legal_balls`], ballsPerOver),
  }
}

export function buildMatchCard(row) {
  const ballsPerOver = row.balls_per_over
  const i1 = inningsCard(row, 1, ballsPerOver)
  const i2 = inningsCard(row, 2, ballsPerOver)

  const isLive = row.status === 'live'
  // Same rule as Phase 9's matchSummary.service.js: 'live' covers both "an
  // innings is being bowled" and "innings 1 finished, innings 2 hasn't
  // started" — distinguished from real cached innings state, never guessed.
  const isInningsBreak = isLive && i1 != null && i2 == null && row.i1_status !== 'live'

  let chase = null
  if (isLive && i1 != null && i2 != null && row.i2_status === 'live') {
    const target = i1.runs + 1
    const ballsRemaining = row.overs_per_innings != null ? getBallsRemaining(row.overs_per_innings, row.i2_legal_balls, ballsPerOver) : null
    chase = {
      target,
      runsNeeded: Math.max(target - i2.runs, 0),
      ballsRemaining,
      requiredRunRate: ballsRemaining != null ? calculateRequiredRunRate(target, i2.runs, ballsRemaining, ballsPerOver) : null,
    }
  }

  return {
    id: row.id,
    status: row.status,
    isInningsBreak,
    isOfficial: row.status === 'finalized',
    awaitingFinalization: row.status === 'completed',
    matchDate: row.match_date,
    venue: row.venue,
    format: { oversPerInnings: row.overs_per_innings, ballsPerOver },
    teamA: { id: row.team_a_id, name: row.team_a_name, shortName: row.team_a_short, logoUrl: row.team_a_logo },
    teamB: { id: row.team_b_id, name: row.team_b_name, shortName: row.team_b_short, logoUrl: row.team_b_logo },
    innings: [i1, i2].filter(Boolean),
    chase,
    result: row.result_type ? { winnerTeamId: row.winner_team_id, resultType: row.result_type, resultMargin: row.result_margin, text: row.result } : null,
  }
}
