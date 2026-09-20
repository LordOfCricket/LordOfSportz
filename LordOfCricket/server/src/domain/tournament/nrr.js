// Net Run Rate — Part 25/26/27, non-negotiable correctness requirement.
//
// NRR = (runs scored / overs faced) - (runs conceded / overs bowled)
//
// "Overs" here is NEVER a decimal parse of a displayed "18.4" string — it is
// always derived from legal-ball counts (innings.legal_balls, the same
// authoritative replay cache column scoring.service.js already writes),
// converted with (legalBalls / ballsPerOver) * ballsPerOver so the unit stays
// "runs per `ballsPerOver`-ball over" without ever passing through a
// mathematically-wrong decimal-overs number.
//
// All-out exception (Part 26, the standard tournament convention): if a team
// is bowled out before facing its full allocated quota, BOTH that innings'
// terms — the batting team's "faced" balls AND the bowling team's "bowled"
// balls for that same innings — are taken as the FULL allocated quota, not
// the actual legal balls delivered. This is deliberately asymmetric with
// "successfully chased in fewer overs" (no adjustment there — that team
// simply faced fewer legal balls, no exception applies).
//
// allOutThreshold is imported from the scoring domain's matchResult.js
// (Part 68: never a second definition of "all out" — reuse the one true one).

import { allOutThreshold } from '../scoring/matchResult.js'

/**
 * @param {object} innings - { battingTeamId, bowlingTeamId, runs, wickets, legalBalls, battingTeamPlayingXiCount }
 * @param {number} oversPerInnings
 * @param {number} ballsPerOver
 * @returns {number} legal balls to use as the denominator for THIS innings (both sides).
 */
export function inningsBallsForNrr(innings, oversPerInnings, ballsPerOver) {
  const quota = oversPerInnings * ballsPerOver
  const threshold = allOutThreshold(innings.battingTeamPlayingXiCount)
  const isAllOut = innings.wickets >= threshold
  if (isAllOut && innings.legalBalls < quota) return quota
  return Math.min(innings.legalBalls, quota)
}

/**
 * Folds every innings of every tournament match a team was involved in into
 * the four raw NRR inputs. `inningsList` is the flat set of ALL innings rows
 * (both teams, every finalized tournament match) — each innings is examined
 * once for what it means to the batting side and once for the bowling side.
 */
export function computeTeamNrrInputs(teamId, inningsList, oversPerInnings, ballsPerOver) {
  let runsScored = 0
  let ballsFaced = 0
  let runsConceded = 0
  let ballsBowled = 0

  for (const inn of inningsList) {
    const ballsForRate = inningsBallsForNrr(inn, oversPerInnings, ballsPerOver)
    if (inn.battingTeamId === teamId) {
      runsScored += inn.runs
      ballsFaced += ballsForRate
    }
    if (inn.bowlingTeamId === teamId) {
      runsConceded += inn.runs
      ballsBowled += ballsForRate
    }
  }

  return { runsScored, ballsFaced, runsConceded, ballsBowled }
}

/** Neutral 0 (not null/NaN) when a team has faced/bowled nothing yet — a
 * team with zero matches must sort neither better nor worse than one with a
 * genuinely even NRR, and must never crash a standings sort. */
export function netRunRate({ runsScored, ballsFaced, runsConceded, ballsBowled }, ballsPerOver) {
  const scoredRate = ballsFaced > 0 ? (runsScored / ballsFaced) * ballsPerOver : 0
  const concededRate = ballsBowled > 0 ? (runsConceded / ballsBowled) * ballsPerOver : 0
  return scoredRate - concededRate
}
