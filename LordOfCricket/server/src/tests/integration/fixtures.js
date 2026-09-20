// Shared setup/teardown for scoring integration tests. Talks to whatever
// PostgreSQL database is configured in .env (PG_HOST etc.) — there is no
// separate test database for this project, so every fixture is created with
// an "Integration Test" name prefix and torn down explicitly at the end of
// each test via cleanup(). Deleting the fixture's `matches` row cascades away
// match_players/innings/deliveries/match_events/wickets/wagon_wheel_shots
// automatically (see schema.sql's ON DELETE CASCADE chain); teams/players are
// deleted explicitly afterward since nothing cascades to them.

import assert from 'node:assert/strict'
import { randomUUID } from 'crypto'
import { pool } from '../../config/db.js'
import * as scoringService from '../../services/scoring.service.js'
import * as matchService from '../../services/match.service.js'
import { createPlayer } from '../../models/player.model.js'

// Phase 8 — test-debt fix: this fixture is documented as "a staff user to
// act as scorer", but never actually had a `staff_role_id`, so `staff_role`
// resolved to null and `requireMatchScorer`'s isSuperAdminUser/
// isApprovedUmpireUser checks always rejected it with 403 — real, confirmed
// pre-existing bug (not a Phase 6/7 regression; the fixture never worked for
// HTTP-level scorer-gated routes). Harmless to the many other callers of
// createFixture/createTeamsFixture that only ever use `userId` as an
// attribution field for direct scoringService/matchService calls (those
// never go through the HTTP scorer-authorization middleware at all) — only
// the two files that hit the real HTTP scoring API
// (commentary.integration.test.js, cricketRealtimePublish.integration.test.js)
// were actually affected by the missing role, and are the fix this resolves.
async function superAdminStaffRoleId() {
  const { rows } = await pool.query(`SELECT id FROM staff_roles WHERE name = 'super_admin'`)
  return rows[0].id
}

export async function createFixture({ ballsPerOver = 6 } = {}) {
  const staffRoleId = await superAdminStaffRoleId()
  const scorerUser = (
    await pool.query(
      `INSERT INTO users (name, email, password_hash, role, staff_role_id) VALUES ('Integration Test Scorer', $1, 'not-a-real-hash', 'staff', $2) RETURNING *`,
      [`integration-test-scorer-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`, staffRoleId]
    )
  ).rows[0]

  const teamA = (await pool.query(`INSERT INTO teams (name, short_name) VALUES ('Integration Test A','ITA') RETURNING *`)).rows[0]
  const teamB = (await pool.query(`INSERT INTO teams (name, short_name) VALUES ('Integration Test B','ITB') RETURNING *`)).rows[0]

  const rahul = (await pool.query(`INSERT INTO players (team_id, name, role) VALUES ($1,'Rahul (test)','Batter') RETURNING *`, [teamA.id])).rows[0]
  const aman = (await pool.query(`INSERT INTO players (team_id, name, role) VALUES ($1,'Aman (test)','Batter') RETURNING *`, [teamA.id])).rows[0]
  // Phase 6: two extra batting-team players (never seated/used by existing
  // tests) so team A's playing-XI count is 4, not 2 — keeps the new
  // roster-aware all-out threshold (playingXi - 1) from firing on a single
  // wicket, which would have broken every pre-Phase-6 test that records more
  // than one wicket in a row against this fixture.
  const batsman3 = (await pool.query(`INSERT INTO players (team_id, name, role) VALUES ($1,'Batsman3 (test)','Batter') RETURNING *`, [teamA.id])).rows[0]
  const batsman4 = (await pool.query(`INSERT INTO players (team_id, name, role) VALUES ($1,'Batsman4 (test)','Batter') RETURNING *`, [teamA.id])).rows[0]
  const bowler1 = (await pool.query(`INSERT INTO players (team_id, name, role) VALUES ($1,'Bowler1 (test)','Bowler') RETURNING *`, [teamB.id])).rows[0]
  const bowler2 = (await pool.query(`INSERT INTO players (team_id, name, role) VALUES ($1,'Bowler2 (test)','Bowler') RETURNING *`, [teamB.id])).rows[0]

  const match = (
    await pool.query(
      `INSERT INTO matches (team_a_id, team_b_id, match_date, status, balls_per_over) VALUES ($1,$2,NOW(),'live',$3) RETURNING *`,
      [teamA.id, teamB.id, ballsPerOver]
    )
  ).rows[0]

  const mp = async (teamId, playerId) =>
    (await pool.query(`INSERT INTO match_players (match_id, team_id, player_id) VALUES ($1,$2,$3) RETURNING *`, [match.id, teamId, playerId])).rows[0]

  const mpRahul = await mp(teamA.id, rahul.id)
  const mpAman = await mp(teamA.id, aman.id)
  const mpBatsman3 = await mp(teamA.id, batsman3.id)
  const mpBatsman4 = await mp(teamA.id, batsman4.id)
  const mpBowler1 = await mp(teamB.id, bowler1.id)
  const mpBowler2 = await mp(teamB.id, bowler2.id)

  const innings = await scoringService.createInnings({ matchId: match.id, inningsNumber: 1, battingTeamId: teamA.id, bowlingTeamId: teamB.id })

  return {
    userId: scorerUser.id,
    teamAId: teamA.id,
    teamBId: teamB.id,
    matchId: match.id,
    inningsId: innings.id,
    rahul: mpRahul.id,
    aman: mpAman.id,
    batsman3: mpBatsman3.id,
    batsman4: mpBatsman4.id,
    bowler1: mpBowler1.id,
    bowler2: mpBowler2.id,
    playerIds: [rahul.id, aman.id, batsman3.id, batsman4.id, bowler1.id, bowler2.id],
    teamIds: [teamA.id, teamB.id],
    async seatOpeners() {
      await scoringService.recordEvent({ inningsId: innings.id, event: { eventType: 'batsman-in', payload: { end: 'strikerEnd', matchPlayerId: mpRahul.id } } })
      return scoringService.recordEvent({ inningsId: innings.id, event: { eventType: 'batsman-in', payload: { end: 'nonStrikerEnd', matchPlayerId: mpAman.id } } })
    },
    async cleanup() {
      // deliveries/wickets/wagon_wheel_shots/match_events reference match_players
      // WITHOUT cascade (intentional — scoring history must never silently vanish
      // because a roster entry was removed), so they have to go before
      // match_players, not just before `matches`. `matches` cascades to `innings`
      // which cascades to all of those, so deleting innings first covers it.
      await pool.query('DELETE FROM innings WHERE match_id = $1', [match.id])
      await pool.query('DELETE FROM match_players WHERE match_id = $1', [match.id])
      await pool.query('DELETE FROM matches WHERE id = $1', [match.id])
      await pool.query('DELETE FROM players WHERE id = ANY($1)', [[rahul.id, aman.id, batsman3.id, batsman4.id, bowler1.id, bowler2.id]])
      await pool.query('DELETE FROM teams WHERE id = ANY($1)', [[teamA.id, teamB.id]])
      // innings (deleted above) cascades away score_corrections, which is the
      // only thing that references this user, so it's safe to delete last.
      await pool.query('DELETE FROM users WHERE id = $1', [scorerUser.id])
    },
  }
}

/**
 * Phase 5 — a "before there's a match yet" fixture: two real teams with a
 * real squad of players each (via player.model.js's createPlayer, same path
 * self-service/roster player creation uses), and a staff user to act as
 * scorer. No match/innings created — tests build those through the actual
 * match.service.js / scoring.service.js flow being exercised.
 */
export async function createTeamsFixture({ squadSize = 3 } = {}) {
  const staffRoleId = await superAdminStaffRoleId()
  const scorerUser = (
    await pool.query(
      `INSERT INTO users (name, email, password_hash, role, staff_role_id) VALUES ('Integration Test Scorer', $1, 'not-a-real-hash', 'staff', $2) RETURNING *`,
      [`integration-test-scorer-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`, staffRoleId]
    )
  ).rows[0]

  const teamA = (await pool.query(`INSERT INTO teams (name, short_name) VALUES ('Integration Test Match A','ITMA') RETURNING *`)).rows[0]
  const teamB = (await pool.query(`INSERT INTO teams (name, short_name) VALUES ('Integration Test Match B','ITMB') RETURNING *`)).rows[0]

  const makeSquad = async (team, prefix) => {
    const players = []
    for (let i = 1; i <= squadSize; i++) {
      players.push(await createPlayer({ name: `${prefix}${i} (test)`, teamId: team.id, role: i === squadSize ? 'BOWLER' : 'BATSMAN' }))
    }
    return players
  }

  const squadA = await makeSquad(teamA, 'A')
  const squadB = await makeSquad(teamB, 'B')

  return {
    userId: scorerUser.id,
    teamAId: teamA.id,
    teamBId: teamB.id,
    squadA,
    squadB,
    async cleanup() {
      const playerIds = [...squadA, ...squadB].map((p) => p.id)
      // Same ordering constraint as createFixture().cleanup(): deliveries/
      // wickets/wagon_wheel_shots/match_events reference match_players WITHOUT
      // cascade, so innings (which cascades to all of those) must go before
      // match_players, not just before matches.
      await pool.query('DELETE FROM innings WHERE match_id IN (SELECT id FROM matches WHERE team_a_id = ANY($1) OR team_b_id = ANY($1))', [[teamA.id, teamB.id]])
      await pool.query('DELETE FROM match_players WHERE match_id IN (SELECT id FROM matches WHERE team_a_id = ANY($1) OR team_b_id = ANY($1))', [[teamA.id, teamB.id]])
      await pool.query('DELETE FROM matches WHERE team_a_id = ANY($1) OR team_b_id = ANY($1)', [[teamA.id, teamB.id]])
      await pool.query('DELETE FROM players WHERE id = ANY($1)', [playerIds])
      await pool.query('DELETE FROM teams WHERE id = ANY($1)', [[teamA.id, teamB.id]])
      await pool.query('DELETE FROM users WHERE id = $1', [scorerUser.id])
    },
  }
}

// ---------------------------------------------------------------------------
// Phase 7/8 — shared "play a real match to a known, deterministic finalized
// state" helpers, built on top of createTeamsFixture(). Used by both
// statistics.integration.test.js and leaderboard.integration.test.js — kept
// here (not in either test file) so importing one test file's helpers never
// re-executes another test file's top-level test() registrations.
// ---------------------------------------------------------------------------

export async function bowl(inningsId, bowlerMp, input) {
  const before = await scoringService.getInningsState(inningsId)
  return scoringService.recordDelivery({ inningsId, expectedVersion: before.innings.version, clientActionId: randomUUID(), input: { ...input, bowlerMatchPlayerId: bowlerMp.id } })
}

export async function bowlDots(inningsId, bowlers, n) {
  let last
  for (let i = 0; i < n; i++) {
    const { state } = await scoringService.getInningsState(inningsId)
    const bowler = bowlers[state.overNumber % bowlers.length]
    last = await bowl(inningsId, bowler, { batRuns: 0 })
  }
  return last
}

/**
 * Plays a complete, deterministic 2-innings match to 'completed' (2 overs a
 * side, 4-a-side) and optionally finalizes it. Innings 1: mpsA[0] and
 * mpsA[1] open, bowled by mpsB[3]/mpsB[2] alternating overs. mpsA[0] hits a
 * four then is caught by mpsB[0] off mpsB[3]; mpsA[2] comes in and finishes
 * not out. Innings 2 (team B batting, reversed): scored just enough dots to
 * complete without chasing, so the RESULT is a runs win for team A —
 * deterministic and never dependent on who's "faster".
 */
export async function playShortFinalizedMatch(fx, { finalize = true, oversPerInnings = 2, ballsPerOver = 6, squadSize = 4 } = {}) {
  const match = await matchService.createMatch({
    teamAId: fx.teamAId,
    teamBId: fx.teamBId,
    venue: 'Integration Test Ground',
    matchDate: new Date().toISOString(),
    oversPerInnings,
    ballsPerOver,
  })

  const mpsA = []
  for (const p of fx.squadA.slice(0, squadSize)) mpsA.push(await scoringService.addMatchPlayer({ matchId: match.id, teamId: fx.teamAId, playerId: p.id, isPlayingXi: true }))
  const mpsB = []
  for (const p of fx.squadB.slice(0, squadSize)) mpsB.push(await scoringService.addMatchPlayer({ matchId: match.id, teamId: fx.teamBId, playerId: p.id, isPlayingXi: true }))

  await matchService.setToss(match.id, { tossWinnerId: fx.teamAId, tossDecision: 'bat' })
  await matchService.startMatch(match.id)

  const innings1 = await scoringService.createInnings({ matchId: match.id, inningsNumber: 1, battingTeamId: fx.teamAId, bowlingTeamId: fx.teamBId })
  await scoringService.recordEvent({ inningsId: innings1.id, event: { eventType: 'batsman-in', payload: { end: 'strikerEnd', matchPlayerId: mpsA[0].id } } })
  await scoringService.recordEvent({ inningsId: innings1.id, event: { eventType: 'batsman-in', payload: { end: 'nonStrikerEnd', matchPlayerId: mpsA[1].id } } })

  const bowlersB = [mpsB[3], mpsB[2]]
  // Over 1: a four, then a caught dismissal off the 3rd ball (mpsA[0] out, credited to mpsB[3] with mpsB[0] as fielder).
  await bowl(innings1.id, bowlersB[0], { batRuns: 4 })
  await bowl(innings1.id, bowlersB[0], { batRuns: 1 })
  await bowl(innings1.id, bowlersB[0], { wicket: { type: 'caught', fielderMatchPlayerId: mpsB[0].id } })
  await scoringService.recordEvent({ inningsId: innings1.id, event: { eventType: 'batsman-in', payload: { end: 'strikerEnd', matchPlayerId: mpsA[2].id } } })
  await bowl(innings1.id, bowlersB[0], { batRuns: 0 })
  await bowl(innings1.id, bowlersB[0], { batRuns: 6 }) // a six
  await bowl(innings1.id, bowlersB[0], { batRuns: 1 })
  // Over 2 (must switch bowlers): fill with dots to complete the innings.
  await bowlDots(innings1.id, bowlersB, ballsPerOver)

  const innings1Reloaded = await scoringService.getInningsState(innings1.id)
  assert.equal(innings1Reloaded.innings.status, 'completed', 'test setup sanity check')

  const innings2 = await scoringService.createInnings({ matchId: match.id, inningsNumber: 2, battingTeamId: fx.teamBId, bowlingTeamId: fx.teamAId })
  await scoringService.recordEvent({ inningsId: innings2.id, event: { eventType: 'batsman-in', payload: { end: 'strikerEnd', matchPlayerId: mpsB[0].id } } })
  await scoringService.recordEvent({ inningsId: innings2.id, event: { eventType: 'batsman-in', payload: { end: 'nonStrikerEnd', matchPlayerId: mpsB[1].id } } })
  const bowlersA = [mpsA[3], mpsA[2]]
  // Deliberately fewer runs than innings 1 scored, and never reaches target -> team A wins by runs.
  await bowlDots(innings2.id, bowlersA, oversPerInnings * ballsPerOver)

  const innings2Reloaded = await scoringService.getInningsState(innings2.id)
  assert.equal(innings2Reloaded.innings.status, 'completed', 'test setup sanity check')

  let matchRow = (await pool.query('SELECT * FROM matches WHERE id = $1', [match.id])).rows[0]
  assert.equal(matchRow.status, 'completed', 'test setup sanity check: match must be COMPLETED before we test the finalize boundary')

  if (finalize) {
    matchRow = await matchService.finalizeMatch(match.id)
  }

  return { match: matchRow, matchId: match.id, innings1, innings2, mpsA, mpsB }
}
