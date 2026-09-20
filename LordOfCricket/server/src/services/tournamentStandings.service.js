// Server-authoritative standings (Part 23) — computed fresh on every call
// from finalized fixtures/innings, never accumulated/cached (README
// principle #1, same "replay, never accumulate" rule career stats/
// leaderboards already follow — see statistics.service.js's own comment).

import * as repo from '../repositories/tournament.repository.js'
import { pointsForResult } from '../domain/tournament/points.js'
import { computeTeamNrrInputs, netRunRate } from '../domain/tournament/nrr.js'
import { sortStandings } from '../domain/tournament/standings.js'

function emptyRecord() {
  return { played: 0, won: 0, lost: 0, tied: 0, noResult: 0, points: 0 }
}

function toInningsInput(row) {
  return {
    battingTeamId: row.batting_team_id,
    bowlingTeamId: row.bowling_team_id,
    runs: row.runs,
    wickets: row.wickets,
    legalBalls: row.legal_balls,
    battingTeamPlayingXiCount: row.batting_team_playing_xi_count,
  }
}

/**
 * @param opts.stage - restrict points tally to one stage (e.g. 'LEAGUE', 'GROUP')
 * @param opts.groupName - restrict to one group's teams+fixtures ('A'|'B') — implies stage='GROUP'
 */
export async function computeStandings(tournamentId, { stage = null, groupName = null, client } = {}) {
  const tournament = await repo.findTournamentById(tournamentId, client)
  const teams = await repo.listTournamentTeams(tournamentId, client)
  const scopedTeams = groupName ? teams.filter((t) => t.group_name === groupName) : teams

  const allResults = await repo.listFinalizedTournamentFixtureResults(tournamentId, client)
  let scopedResults = allResults
  const effectiveStage = groupName ? 'GROUP' : stage
  if (effectiveStage) scopedResults = scopedResults.filter((r) => r.stage === effectiveStage)
  if (groupName) {
    const teamIdSet = new Set(scopedTeams.map((t) => t.team_id))
    scopedResults = scopedResults.filter((r) => teamIdSet.has(r.team_a_id) && teamIdSet.has(r.team_b_id))
  }

  const records = new Map(scopedTeams.map((t) => [t.team_id, emptyRecord()]))
  for (const r of scopedResults) {
    const isTie = r.result_type === 'TIE'
    const isNoResult = r.result_type === 'NO_RESULT'
    for (const teamId of [r.team_a_id, r.team_b_id]) {
      if (!records.has(teamId)) continue
      const rec = records.get(teamId)
      rec.played += 1
      if (isTie) rec.tied += 1
      else if (isNoResult) rec.noResult += 1
      else if (r.winner_team_id === teamId) rec.won += 1
      else rec.lost += 1
      rec.points += pointsForResult(r.result_type, r.winner_team_id === teamId)
    }
  }

  const scopedMatchIds = new Set(scopedResults.map((r) => r.match_id))
  const inningsRows = await repo.listFinalizedTournamentInnings(tournamentId, client)
  const scopedInnings = inningsRows.filter((row) => scopedMatchIds.has(row.match_id)).map(toInningsInput)

  for (const [teamId, rec] of records) {
    const inputs = computeTeamNrrInputs(teamId, scopedInnings, tournament.overs_per_innings, tournament.balls_per_over)
    rec.nrr = netRunRate(inputs, tournament.balls_per_over)
  }

  const rows = scopedTeams.map((t) => ({ teamId: t.team_id, teamName: t.team_name, teamShort: t.team_short, ...records.get(t.team_id) }))
  return sortStandings(rows)
}

/** Both groups' standings, computed within the SAME transaction/client the
 * caller is already using (knockout progression needs a consistent read). */
export async function computeGroupStandings(tournamentId, client) {
  const [groupA, groupB] = await Promise.all([
    computeStandings(tournamentId, { groupName: 'A', client }),
    computeStandings(tournamentId, { groupName: 'B', client }),
  ])
  return { groupA, groupB }
}

/** Public-facing shape — decides what "standings" even means per format
 * (Part 44): LEAGUE has one table, GROUPS_KNOCKOUT has two, pure KNOCKOUT
 * has none (the bracket IS the standings). */
export async function getTournamentStandings(tournamentId) {
  const tournament = await repo.findTournamentById(tournamentId)
  if (!tournament) return null
  if (tournament.format === 'LEAGUE') {
    return { overall: await computeStandings(tournamentId, { stage: 'LEAGUE' }) }
  }
  if (tournament.format === 'GROUPS_KNOCKOUT') {
    const { groupA, groupB } = await computeGroupStandings(tournamentId)
    return { groupA, groupB }
  }
  return null
}
