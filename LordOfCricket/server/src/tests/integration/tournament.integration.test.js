// Phase 15 integration tests — tournament creation/registration, historical
// squad/transfer safety, fixture generation + idempotency, LOC match linking,
// standings/NRR through REAL scoring, correction safety, and privacy. Same
// convention as every other integration test in this suite: real PostgreSQL,
// explicit fixture/cleanup, no mocks (tests/integration/tournamentFixtures.js).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pool } from '../../config/db.js'
import * as tournamentService from '../../services/tournament.service.js'
import * as fixtureService from '../../services/tournamentFixture.service.js'
import * as standingsService from '../../services/tournamentStandings.service.js'
import * as repo from '../../repositories/tournament.repository.js'
import * as scoringService from '../../services/scoring.service.js'
import * as matchService from '../../services/match.service.js'
import * as correctionService from '../../services/correction.service.js'
import { TournamentError, TOURNAMENT_ERROR_CODES as CODES } from '../../domain/tournament/errors.js'
import { computeTeamNrrInputs, netRunRate } from '../../domain/tournament/nrr.js'
import { createStaffUser, createTeamsWithSquads, cleanupTournamentTest, bowl, bowlDots } from './tournamentFixtures.js'

function futureDate(daysAhead = 30) {
  const d = new Date()
  d.setDate(d.getDate() + daysAhead)
  return d.toISOString().slice(0, 10)
}

async function makeTournament(staffId, overrides = {}) {
  return tournamentService.createTournament({
    name: `Integration Test Tournament ${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    format: 'LEAGUE',
    startDate: futureDate(1),
    endDate: futureDate(10),
    oversPerInnings: 2,
    ballsPerOver: 6,
    maxTeams: 8,
    maxSquadSize: 5,
    createdBy: staffId,
    ...overrides,
  })
}

/** Sets a Playing XI, toss, and starts the match — the minimum a fixture's
 * linked match needs before deliveries can be recorded. */
async function setupLiveMatch(matchId, teamAId, teamBId, squadA, squadB) {
  const mpsA = []
  for (const p of squadA) mpsA.push(await scoringService.addMatchPlayer({ matchId, teamId: teamAId, playerId: p.id, isPlayingXi: true }))
  const mpsB = []
  for (const p of squadB) mpsB.push(await scoringService.addMatchPlayer({ matchId, teamId: teamBId, playerId: p.id, isPlayingXi: true }))
  await matchService.setToss(matchId, { tossWinnerId: teamAId, tossDecision: 'bat' })
  const match = await matchService.startMatch(matchId)
  return { match, mpsA, mpsB }
}

/** Plays a short, deterministic 2-innings match on an already-scheduled
 * fixture's match and finalizes it — then explicitly invokes the same
 * progression hook match.controller.js calls after a real HTTP finalize
 * (integration tests in this codebase call services directly, never HTTP —
 * see match.integration.test.js/lifecycle.integration.test.js). */
async function playAndFinalizeFixtureMatch(matchId, teamAId, teamBId, squadA, squadB, { oversPerInnings = 2, ballsPerOver = 6 } = {}) {
  const { mpsA, mpsB } = await setupLiveMatch(matchId, teamAId, teamBId, squadA, squadB)

  const innings1 = await scoringService.createInnings({ matchId, inningsNumber: 1, battingTeamId: teamAId, bowlingTeamId: teamBId })
  await scoringService.recordEvent({ inningsId: innings1.id, event: { eventType: 'batsman-in', payload: { end: 'strikerEnd', matchPlayerId: mpsA[0].id } } })
  await scoringService.recordEvent({ inningsId: innings1.id, event: { eventType: 'batsman-in', payload: { end: 'nonStrikerEnd', matchPlayerId: mpsA[1].id } } })
  const bowlersB = [mpsB[mpsB.length - 1], mpsB[mpsB.length - 2]]
  await bowl(innings1.id, bowlersB[0], { batRuns: 4 })
  await bowl(innings1.id, bowlersB[0], { batRuns: 1 })
  await bowlDots(innings1.id, bowlersB, oversPerInnings * ballsPerOver - 2)

  const innings2 = await scoringService.createInnings({ matchId, inningsNumber: 2, battingTeamId: teamBId, bowlingTeamId: teamAId })
  await scoringService.recordEvent({ inningsId: innings2.id, event: { eventType: 'batsman-in', payload: { end: 'strikerEnd', matchPlayerId: mpsB[0].id } } })
  await scoringService.recordEvent({ inningsId: innings2.id, event: { eventType: 'batsman-in', payload: { end: 'nonStrikerEnd', matchPlayerId: mpsB[1].id } } })
  const bowlersA = [mpsA[mpsA.length - 1], mpsA[mpsA.length - 2]]
  await bowlDots(innings2.id, bowlersA, oversPerInnings * ballsPerOver) // never chases -> team A wins by runs

  const finalized = await matchService.finalizeMatch(matchId)
  await fixtureService.onMatchFinalized(matchId) // the controller-layer hook, invoked explicitly (see comment above)
  return { match: finalized, innings1, innings2 }
}

// ---------------------------------------------------------------------------
// Creation & discovery
// ---------------------------------------------------------------------------

test('TOURNAMENT CREATION — creates in DRAFT, appears in public discovery, public detail readable', async () => {
  const staff = await createStaffUser()
  const t = await makeTournament(staff.id)
  try {
    assert.equal(t.status, 'DRAFT')
    assert.match(t.public_tournament_id, /^TRN-/)

    const found = await tournamentService.findTournamentByPublicId(t.public_tournament_id)
    assert.equal(found.id, t.id)

    const { items } = await tournamentService.listPublicTournaments({ category: 'UPCOMING' })
    assert.ok(items.some((row) => row.id === t.id))
  } finally {
    await cleanupTournamentTest({ tournamentIds: [t.id], userIds: [staff.id] })
  }
})

test('TOURNAMENT CREATION — rejects an invalid format/date range rather than guessing', async () => {
  const staff = await createStaffUser()
  try {
    await assert.rejects(() => makeTournament(staff.id, { format: 'ROUND_ROBIN_SWISS' }), TournamentError)
    await assert.rejects(() => makeTournament(staff.id, { startDate: futureDate(10), endDate: futureDate(1) }), TournamentError)
  } finally {
    await cleanupTournamentTest({ userIds: [staff.id] })
  }
})

// ---------------------------------------------------------------------------
// Team registration
// ---------------------------------------------------------------------------

test('TEAM REGISTRATION — register, duplicate rejected, invalid team rejected, lifecycle lock enforced', async () => {
  const staff = await createStaffUser()
  const t = await makeTournament(staff.id, { maxTeams: 8 })
  const teams = await createTeamsWithSquads(2)
  try {
    await assert.rejects(() => tournamentService.registerTeam(t.id, { teamId: teams[0].team.id }), (err) => err.code === CODES.INVALID_TOURNAMENT_STATE)

    await tournamentService.openRegistration(t.id)
    await tournamentService.registerTeam(t.id, { teamId: teams[0].team.id })
    await assert.rejects(() => tournamentService.registerTeam(t.id, { teamId: teams[0].team.id }), (err) => err.code === CODES.TEAM_ALREADY_REGISTERED)
    await assert.rejects(() => tournamentService.registerTeam(t.id, { teamId: 999999999 }), (err) => err.code === CODES.VALIDATION_ERROR)

    await tournamentService.registerTeam(t.id, { teamId: teams[1].team.id })
    await fixtureService.generateFixtures(t.id) // -> SCHEDULED, locks registration
    await assert.rejects(() => tournamentService.registerTeam(t.id, { teamId: teams[0].team.id }), (err) => err.code === CODES.INVALID_TOURNAMENT_STATE)
  } finally {
    await cleanupTournamentTest({ tournamentIds: [t.id], teamIds: teams.map((x) => x.team.id), playerIds: teams.flatMap((x) => x.players.map((p) => p.id)), userIds: [staff.id] })
  }
})

test('TEAM REGISTRATION — a full tournament rejects further registrations', async () => {
  const staff = await createStaffUser()
  const t = await makeTournament(staff.id, { maxTeams: 2 })
  const teams = await createTeamsWithSquads(3)
  try {
    await tournamentService.openRegistration(t.id)
    await tournamentService.registerTeam(t.id, { teamId: teams[0].team.id })
    await tournamentService.registerTeam(t.id, { teamId: teams[1].team.id })
    await assert.rejects(() => tournamentService.registerTeam(t.id, { teamId: teams[2].team.id }), (err) => err.code === CODES.TOURNAMENT_FULL)
  } finally {
    await cleanupTournamentTest({ tournamentIds: [t.id], teamIds: teams.map((x) => x.team.id), playerIds: teams.flatMap((x) => x.players.map((p) => p.id)), userIds: [staff.id] })
  }
})

// ---------------------------------------------------------------------------
// Squads + CRITICAL transfer-safety test
// ---------------------------------------------------------------------------

test('SQUAD — register players, duplicate/cross-team rejected, squad size enforced', async () => {
  const staff = await createStaffUser()
  const t = await makeTournament(staff.id, { maxSquadSize: 2 })
  const teams = await createTeamsWithSquads(2, 3)
  try {
    await tournamentService.openRegistration(t.id)
    await tournamentService.registerTeam(t.id, { teamId: teams[0].team.id })
    await tournamentService.registerTeam(t.id, { teamId: teams[1].team.id })

    await tournamentService.addSquadPlayer(t.id, { teamId: teams[0].team.id, playerId: teams[0].players[0].id })
    await assert.rejects(
      () => tournamentService.addSquadPlayer(t.id, { teamId: teams[1].team.id, playerId: teams[0].players[0].id }),
      (err) => err.code === CODES.PLAYER_ALREADY_REGISTERED
    )

    await tournamentService.addSquadPlayer(t.id, { teamId: teams[0].team.id, playerId: teams[0].players[1].id })
    await assert.rejects(
      () => tournamentService.addSquadPlayer(t.id, { teamId: teams[0].team.id, playerId: teams[0].players[2].id }),
      (err) => err.code === CODES.SQUAD_FULL
    )
  } finally {
    await cleanupTournamentTest({ tournamentIds: [t.id], teamIds: teams.map((x) => x.team.id), playerIds: teams.flatMap((x) => x.players.map((p) => p.id)), userIds: [staff.id] })
  }
})

test('CRITICAL TRANSFER TEST — a player who transfers teams AFTER tournament registration keeps their ORIGINAL tournament squad representation', async () => {
  const staff = await createStaffUser()
  const t = await makeTournament(staff.id)
  const teams = await createTeamsWithSquads(2, 3)
  const [teamA, teamB] = teams
  try {
    await tournamentService.openRegistration(t.id)
    await tournamentService.registerTeam(t.id, { teamId: teamA.team.id })
    await tournamentService.registerTeam(t.id, { teamId: teamB.team.id })
    const player = teamA.players[0]
    await tournamentService.addSquadPlayer(t.id, { teamId: teamA.team.id, playerId: player.id })

    // Tournament proceeds (fixtures generated -> "tournament begins").
    await fixtureService.generateFixtures(t.id)

    // Later: the player transfers to Team B in real life (players.team_id changes).
    await pool.query('UPDATE players SET team_id = $1 WHERE id = $2', [teamB.team.id, player.id])
    const refetchedPlayer = (await pool.query('SELECT team_id FROM players WHERE id = $1', [player.id])).rows[0]
    assert.equal(refetchedPlayer.team_id, teamB.team.id, 'sanity check: the transfer really happened')

    // The tournament's historical squad must still show them representing Team A.
    const squad = await tournamentService.listSquad(t.id)
    const entry = squad.find((s) => s.player_id === player.id)
    assert.ok(entry, 'player must still appear in the tournament squad')
    const tournamentTeamRow = await repo.findTournamentTeamById(entry.tournament_team_id)
    assert.equal(tournamentTeamRow.team_id, teamA.team.id, 'tournament history must still say Team A, never the new current team')
  } finally {
    await cleanupTournamentTest({ tournamentIds: [t.id], teamIds: teams.map((x) => x.team.id), playerIds: teams.flatMap((x) => x.players.map((p) => p.id)), userIds: [staff.id] })
  }
})

// ---------------------------------------------------------------------------
// Fixture generation + idempotency
// ---------------------------------------------------------------------------

test('FIXTURE GENERATION — round robin for 4 teams produces exactly 6 fixtures, every pair once', async () => {
  const staff = await createStaffUser()
  const t = await makeTournament(staff.id)
  const teams = await createTeamsWithSquads(4)
  try {
    await tournamentService.openRegistration(t.id)
    for (const team of teams) await tournamentService.registerTeam(t.id, { teamId: team.team.id })
    await fixtureService.generateFixtures(t.id)

    const fixtures = await fixtureService.listFixtures(t.id)
    assert.equal(fixtures.length, 6) // C(4,2)
    const pairs = new Set(fixtures.map((f) => [f.team_a_id, f.team_b_id].sort().join('-')))
    assert.equal(pairs.size, 6, 'every pair must appear exactly once')
  } finally {
    await cleanupTournamentTest({ tournamentIds: [t.id], teamIds: teams.map((x) => x.team.id), playerIds: teams.flatMap((x) => x.players.map((p) => p.id)), userIds: [staff.id] })
  }
})

test('FIXTURE GENERATION IDEMPOTENCY — generating twice never duplicates fixtures, including under real concurrency', async () => {
  const staff = await createStaffUser()
  const t = await makeTournament(staff.id)
  const teams = await createTeamsWithSquads(3)
  try {
    await tournamentService.openRegistration(t.id)
    for (const team of teams) await tournamentService.registerTeam(t.id, { teamId: team.team.id })

    const results = await Promise.allSettled([fixtureService.generateFixtures(t.id), fixtureService.generateFixtures(t.id)])
    const fulfilled = results.filter((r) => r.status === 'fulfilled')
    const rejected = results.filter((r) => r.status === 'rejected')
    assert.equal(fulfilled.length, 1, 'exactly one concurrent generation call should succeed')
    assert.equal(rejected.length, 1)
    assert.equal(rejected[0].reason.code, CODES.FIXTURES_ALREADY_GENERATED)

    const fixtures = await fixtureService.listFixtures(t.id)
    assert.equal(fixtures.length, 3) // C(3,2) — never doubled to 6

    await assert.rejects(() => fixtureService.generateFixtures(t.id), (err) => err.code === CODES.FIXTURES_ALREADY_GENERATED)
    const fixturesAfterThirdCall = await fixtureService.listFixtures(t.id)
    assert.equal(fixturesAfterThirdCall.length, 3)
  } finally {
    await cleanupTournamentTest({ tournamentIds: [t.id], teamIds: teams.map((x) => x.team.id), playerIds: teams.flatMap((x) => x.players.map((p) => p.id)), userIds: [staff.id] })
  }
})

test('FIXTURE GENERATION — invalid team counts are rejected, never silently produce an impossible bracket', async () => {
  const staff = await createStaffUser()
  const t = await makeTournament(staff.id, { format: 'KNOCKOUT', maxTeams: 8 })
  const teams = await createTeamsWithSquads(3)
  try {
    await tournamentService.openRegistration(t.id)
    for (const team of teams) await tournamentService.registerTeam(t.id, { teamId: team.team.id })
    await assert.rejects(() => fixtureService.generateFixtures(t.id), (err) => err.code === CODES.INVALID_TEAM_COUNT)
  } finally {
    await cleanupTournamentTest({ tournamentIds: [t.id], teamIds: teams.map((x) => x.team.id), playerIds: teams.flatMap((x) => x.players.map((p) => p.id)), userIds: [staff.id] })
  }
})

// ---------------------------------------------------------------------------
// LOC match integration — scheduling links to exactly one real match,
// existing scoring engine is what actually plays it.
// ---------------------------------------------------------------------------

test('MATCH LINK — scheduling a fixture creates exactly one real LOC match inheriting the tournament format', async () => {
  const staff = await createStaffUser()
  const t = await makeTournament(staff.id, { oversPerInnings: 5, ballsPerOver: 6 })
  const teams = await createTeamsWithSquads(2, 4)
  const matchIds = []
  try {
    await tournamentService.openRegistration(t.id)
    await tournamentService.registerTeam(t.id, { teamId: teams[0].team.id })
    await tournamentService.registerTeam(t.id, { teamId: teams[1].team.id })
    await fixtureService.generateFixtures(t.id)
    const [fixture] = await fixtureService.listFixtures(t.id)
    assert.equal(fixture.match_id, null)

    const scheduled = await fixtureService.scheduleFixture(fixture.id, { matchDate: new Date().toISOString(), venue: 'Integration Test Ground' })
    assert.ok(scheduled.match_id)
    matchIds.push(scheduled.match_id)

    const matchRow = (await pool.query('SELECT * FROM matches WHERE id = $1', [scheduled.match_id])).rows[0]
    assert.equal(matchRow.overs_per_innings, 5, 'the match must inherit the tournament overs, never a client-supplied value')
    assert.equal(matchRow.balls_per_over, 6)
    assert.deepEqual([matchRow.team_a_id, matchRow.team_b_id].sort(), [fixture.team_a_id, fixture.team_b_id].sort())

    // Scheduling twice must be rejected — one fixture maps to at most one match.
    await assert.rejects(() => fixtureService.scheduleFixture(fixture.id, { matchDate: new Date().toISOString() }), (err) => err.code === CODES.INVALID_FIXTURE_STATE)
  } finally {
    await cleanupTournamentTest({ tournamentIds: [t.id], matchIds, teamIds: teams.map((x) => x.team.id), playerIds: teams.flatMap((x) => x.players.map((p) => p.id)), userIds: [staff.id] })
  }
})

// ---------------------------------------------------------------------------
// Standings + NRR through REAL scoring (Part 81/82 — non-negotiable)
// ---------------------------------------------------------------------------

test('STANDINGS + NRR — a finalized real match automatically updates points/NRR, cross-checked independently', async () => {
  const staff = await createStaffUser()
  const t = await makeTournament(staff.id, { oversPerInnings: 2, ballsPerOver: 6 })
  const teams = await createTeamsWithSquads(2, 4)
  const [teamA, teamB] = teams
  const matchIds = []
  try {
    await tournamentService.openRegistration(t.id)
    await tournamentService.registerTeam(t.id, { teamId: teamA.team.id })
    await tournamentService.registerTeam(t.id, { teamId: teamB.team.id })
    await fixtureService.generateFixtures(t.id)
    const [fixture] = await fixtureService.listFixtures(t.id)
    const scheduled = await fixtureService.scheduleFixture(fixture.id, { matchDate: new Date().toISOString() })
    matchIds.push(scheduled.match_id)

    // Before any result: standings show 0 played, 0 points, 0 NRR.
    const before = await standingsService.getTournamentStandings(t.id)
    assert.ok(before.overall.every((row) => row.played === 0 && row.points === 0 && row.nrr === 0))

    const { match } = await playAndFinalizeFixtureMatch(scheduled.match_id, teamA.team.id, teamB.team.id, teamA.players, teamB.players, { oversPerInnings: 2, ballsPerOver: 6 })
    assert.equal(match.status, 'finalized')

    const after = await standingsService.getTournamentStandings(t.id)
    const winnerRow = after.overall.find((r) => r.teamId === match.winner_team_id)
    const loserRow = after.overall.find((r) => r.teamId !== match.winner_team_id)
    assert.equal(winnerRow.points, 2)
    assert.equal(winnerRow.won, 1)
    assert.equal(loserRow.points, 0)
    assert.equal(loserRow.lost, 1)

    // Independent NRR cross-check: read the real committed innings rows
    // directly and recompute with the SAME (already unit-tested) pure
    // formula, proving the SERVICE's SQL/wiring is correct end-to-end —
    // never a seeded/fabricated NRR value (Part 82).
    const inningsRows = (await pool.query('SELECT batting_team_id, bowling_team_id, runs, wickets, legal_balls FROM innings WHERE match_id = $1', [scheduled.match_id])).rows
    const withXi = await Promise.all(
      inningsRows.map(async (row) => ({
        battingTeamId: row.batting_team_id,
        bowlingTeamId: row.bowling_team_id,
        runs: row.runs,
        wickets: row.wickets,
        legalBalls: row.legal_balls,
        battingTeamPlayingXiCount: (await pool.query('SELECT COUNT(*)::int AS c FROM match_players WHERE match_id = $1 AND team_id = $2 AND is_playing_xi = true', [scheduled.match_id, row.batting_team_id])).rows[0].c,
      }))
    )
    const expectedInputs = computeTeamNrrInputs(winnerRow.teamId, withXi, 2, 6)
    const expectedNrr = netRunRate(expectedInputs, 6)
    assert.equal(winnerRow.nrr, expectedNrr)
  } finally {
    await cleanupTournamentTest({ tournamentIds: [t.id], matchIds, teamIds: teams.map((x) => x.team.id), playerIds: teams.flatMap((x) => x.players.map((p) => p.id)), userIds: [staff.id] })
  }
})

// ---------------------------------------------------------------------------
// Correction safety (Part 34/83)
// ---------------------------------------------------------------------------

test('CORRECTION SAFETY — standings only ever reflect the FINALIZED (post-correction) result, never a stale pre-correction one', async () => {
  const staff = await createStaffUser()
  const t = await makeTournament(staff.id, { oversPerInnings: 2, ballsPerOver: 6 })
  const teams = await createTeamsWithSquads(2, 4)
  const [teamA, teamB] = teams
  const matchIds = []
  try {
    await tournamentService.openRegistration(t.id)
    await tournamentService.registerTeam(t.id, { teamId: teamA.team.id })
    await tournamentService.registerTeam(t.id, { teamId: teamB.team.id })
    await fixtureService.generateFixtures(t.id)
    const [fixture] = await fixtureService.listFixtures(t.id)
    const scheduled = await fixtureService.scheduleFixture(fixture.id, { matchDate: new Date().toISOString() })
    matchIds.push(scheduled.match_id)

    const { mpsA, mpsB } = await setupLiveMatch(scheduled.match_id, teamA.team.id, teamB.team.id, teamA.players, teamB.players)
    const innings1 = await scoringService.createInnings({ matchId: scheduled.match_id, inningsNumber: 1, battingTeamId: teamA.team.id, bowlingTeamId: teamB.team.id })
    await scoringService.recordEvent({ inningsId: innings1.id, event: { eventType: 'batsman-in', payload: { end: 'strikerEnd', matchPlayerId: mpsA[0].id } } })
    await scoringService.recordEvent({ inningsId: innings1.id, event: { eventType: 'batsman-in', payload: { end: 'nonStrikerEnd', matchPlayerId: mpsA[1].id } } })
    const bowlersB = [mpsB[3], mpsB[2]]
    const scoredDelivery = await bowl(innings1.id, bowlersB[0], { batRuns: 6 }) // team A: 6 runs total
    await bowlDots(innings1.id, bowlersB, 2 * 6 - 1)

    const innings2 = await scoringService.createInnings({ matchId: scheduled.match_id, inningsNumber: 2, battingTeamId: teamB.team.id, bowlingTeamId: teamA.team.id })
    await scoringService.recordEvent({ inningsId: innings2.id, event: { eventType: 'batsman-in', payload: { end: 'strikerEnd', matchPlayerId: mpsB[0].id } } })
    await scoringService.recordEvent({ inningsId: innings2.id, event: { eventType: 'batsman-in', payload: { end: 'nonStrikerEnd', matchPlayerId: mpsB[1].id } } })
    const bowlersA = [mpsA[3], mpsA[2]]
    await bowl(innings2.id, bowlersA[0], { batRuns: 4 }) // team B: 4 runs total
    await bowlDots(innings2.id, bowlersA, 2 * 6 - 1)

    const completedMatch = (await pool.query('SELECT * FROM matches WHERE id = $1', [scheduled.match_id])).rows[0]
    assert.equal(completedMatch.status, 'completed')
    assert.equal(completedMatch.winner_team_id, teamA.team.id, 'sanity check: team A (6) beats team B (4) by runs before any correction')

    // Correction: the "six" that gave team A their only runs was actually a
    // dot ball. Team A's total drops to 0, so the target drops to 1 — team
    // B's already-recorded 4 runs now clears it, flipping the winner.
    await correctionService.applyCorrection({
      inningsId: innings1.id,
      targetType: 'delivery',
      targetId: scoredDelivery.delivery.id,
      reasonCode: 'WRONG_RUNS',
      patch: { batRuns: 0 },
      correctedByUserId: staff.id,
    })

    const finalized = await matchService.finalizeMatch(scheduled.match_id)
    await fixtureService.onMatchFinalized(scheduled.match_id)
    assert.equal(finalized.winner_team_id, teamB.team.id, 'sanity check: the correction really flipped the winner before finalize')

    const standings = await standingsService.getTournamentStandings(t.id)
    const teamBRow = standings.overall.find((r) => r.teamId === teamB.team.id)
    const teamARow = standings.overall.find((r) => r.teamId === teamA.team.id)
    assert.equal(teamBRow.points, 2, 'standings must reflect the CORRECTED winner')
    assert.equal(teamARow.points, 0)
  } finally {
    await cleanupTournamentTest({ tournamentIds: [t.id], matchIds, teamIds: teams.map((x) => x.team.id), playerIds: teams.flatMap((x) => x.players.map((p) => p.id)), userIds: [staff.id] })
  }
})

// ---------------------------------------------------------------------------
// Privacy (Part 87)
// ---------------------------------------------------------------------------

test('PRIVACY — public-facing tournament repository reads never carry email/password/user_id', async () => {
  const staff = await createStaffUser()
  const t = await makeTournament(staff.id)
  const teams = await createTeamsWithSquads(2)
  try {
    await tournamentService.openRegistration(t.id)
    await tournamentService.registerTeam(t.id, { teamId: teams[0].team.id });
    await tournamentService.registerTeam(t.id, { teamId: teams[1].team.id })
    await tournamentService.addSquadPlayer(t.id, { teamId: teams[0].team.id, playerId: teams[0].players[0].id })
    await fixtureService.generateFixtures(t.id)

    const forbidden = ['email', 'password', 'password_hash', 'user_id']
    const teamRows = await repo.listTournamentTeams(t.id)
    const squadRows = await repo.listSquadPlayers(t.id)
    const fixtureRows = await repo.listFixturesByTournament(t.id)
    const { rows: discoveryRows } = await repo.listPublicTournaments({})

    for (const rowset of [teamRows, squadRows, fixtureRows, discoveryRows]) {
      for (const row of rowset) {
        for (const key of Object.keys(row)) {
          assert.ok(!forbidden.includes(key.toLowerCase()), `unexpected private field '${key}' in a public tournament read`)
        }
      }
    }
  } finally {
    await cleanupTournamentTest({ tournamentIds: [t.id], teamIds: teams.map((x) => x.team.id), playerIds: teams.flatMap((x) => x.players.map((p) => p.id)), userIds: [staff.id] })
  }
})
