// Phase 15 integration tests — group qualification, knockout progression,
// champion crowning, and the manual tie/no-result resolution path (Part
// 35/36 — LOC has no Super Over engine, so a tie must never auto-advance a
// fabricated winner). Real PostgreSQL, real scoring engine throughout.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as tournamentService from '../../services/tournament.service.js'
import * as fixtureService from '../../services/tournamentFixture.service.js'
import * as repo from '../../repositories/tournament.repository.js'
import * as scoringService from '../../services/scoring.service.js'
import * as matchService from '../../services/match.service.js'
import { TOURNAMENT_ERROR_CODES as CODES } from '../../domain/tournament/errors.js'
import { isFixtureResolved } from '../../domain/tournament/progression.js'
import { createStaffUser, createTeamsWithSquads, cleanupTournamentTest, bowl, bowlDots } from './tournamentFixtures.js'

function futureDate(daysAhead = 30) {
  const d = new Date()
  d.setDate(d.getDate() + daysAhead)
  return d.toISOString().slice(0, 10)
}

async function makeTournament(staffId, overrides = {}) {
  return tournamentService.createTournament({
    name: `Integration Test Knockout ${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    format: 'GROUPS_KNOCKOUT',
    startDate: futureDate(1),
    endDate: futureDate(10),
    oversPerInnings: 1,
    ballsPerOver: 6,
    maxTeams: 8,
    maxSquadSize: 6,
    createdBy: staffId,
    ...overrides,
  })
}

/** Schedules + plays + finalizes a fixture so that `winningTeamId` wins by
 * runs (winningTeamId bats first and scores a boundary; the other side bats
 * second and only faces dots) — deterministic, never a coin flip. */
async function playFixtureToWin(matchIds, fixture, winningTeamId, squadByTeamId, { oversPerInnings = 1, ballsPerOver = 6 } = {}) {
  const scheduled = await fixtureService.scheduleFixture(fixture.id, { matchDate: new Date().toISOString() })
  matchIds.push(scheduled.match_id)
  const losingTeamId = fixture.team_a_id === winningTeamId ? fixture.team_b_id : fixture.team_a_id
  const squadWin = squadByTeamId.get(winningTeamId)
  const squadLose = squadByTeamId.get(losingTeamId)

  const mpsWin = []
  for (const p of squadWin) mpsWin.push(await scoringService.addMatchPlayer({ matchId: scheduled.match_id, teamId: winningTeamId, playerId: p.id, isPlayingXi: true }))
  const mpsLose = []
  for (const p of squadLose) mpsLose.push(await scoringService.addMatchPlayer({ matchId: scheduled.match_id, teamId: losingTeamId, playerId: p.id, isPlayingXi: true }))
  await matchService.setToss(scheduled.match_id, { tossWinnerId: winningTeamId, tossDecision: 'bat' })
  await matchService.startMatch(scheduled.match_id)

  const innings1 = await scoringService.createInnings({ matchId: scheduled.match_id, inningsNumber: 1, battingTeamId: winningTeamId, bowlingTeamId: losingTeamId })
  await scoringService.recordEvent({ inningsId: innings1.id, event: { eventType: 'batsman-in', payload: { end: 'strikerEnd', matchPlayerId: mpsWin[0].id } } })
  await scoringService.recordEvent({ inningsId: innings1.id, event: { eventType: 'batsman-in', payload: { end: 'nonStrikerEnd', matchPlayerId: mpsWin[1].id } } })
  const bowlersLose = [mpsLose[mpsLose.length - 1], mpsLose[mpsLose.length - 2]]
  await bowl(innings1.id, bowlersLose[0], { batRuns: 4 })
  await bowlDots(innings1.id, bowlersLose, oversPerInnings * ballsPerOver - 1)

  const innings2 = await scoringService.createInnings({ matchId: scheduled.match_id, inningsNumber: 2, battingTeamId: losingTeamId, bowlingTeamId: winningTeamId })
  await scoringService.recordEvent({ inningsId: innings2.id, event: { eventType: 'batsman-in', payload: { end: 'strikerEnd', matchPlayerId: mpsLose[0].id } } })
  await scoringService.recordEvent({ inningsId: innings2.id, event: { eventType: 'batsman-in', payload: { end: 'nonStrikerEnd', matchPlayerId: mpsLose[1].id } } })
  const bowlersWin = [mpsWin[mpsWin.length - 1], mpsWin[mpsWin.length - 2]]
  await bowlDots(innings2.id, bowlersWin, oversPerInnings * ballsPerOver)

  const finalized = await matchService.finalizeMatch(scheduled.match_id)
  await fixtureService.onMatchFinalized(scheduled.match_id)
  assert.equal(finalized.winner_team_id, winningTeamId, 'test setup sanity check')
  return finalized
}

/** A tied fixture: both sides score exactly the same, deterministically. */
async function playFixtureToTie(matchIds, fixture, squadByTeamId, { oversPerInnings = 1, ballsPerOver = 6 } = {}) {
  const scheduled = await fixtureService.scheduleFixture(fixture.id, { matchDate: new Date().toISOString() })
  matchIds.push(scheduled.match_id)
  const teamAId = fixture.team_a_id
  const teamBId = fixture.team_b_id
  const squadA = squadByTeamId.get(teamAId)
  const squadB = squadByTeamId.get(teamBId)

  const mpsA = []
  for (const p of squadA) mpsA.push(await scoringService.addMatchPlayer({ matchId: scheduled.match_id, teamId: teamAId, playerId: p.id, isPlayingXi: true }))
  const mpsB = []
  for (const p of squadB) mpsB.push(await scoringService.addMatchPlayer({ matchId: scheduled.match_id, teamId: teamBId, playerId: p.id, isPlayingXi: true }))
  await matchService.setToss(scheduled.match_id, { tossWinnerId: teamAId, tossDecision: 'bat' })
  await matchService.startMatch(scheduled.match_id)

  const innings1 = await scoringService.createInnings({ matchId: scheduled.match_id, inningsNumber: 1, battingTeamId: teamAId, bowlingTeamId: teamBId })
  await scoringService.recordEvent({ inningsId: innings1.id, event: { eventType: 'batsman-in', payload: { end: 'strikerEnd', matchPlayerId: mpsA[0].id } } })
  await scoringService.recordEvent({ inningsId: innings1.id, event: { eventType: 'batsman-in', payload: { end: 'nonStrikerEnd', matchPlayerId: mpsA[1].id } } })
  const bowlersB = [mpsB[mpsB.length - 1], mpsB[mpsB.length - 2]]
  await bowl(innings1.id, bowlersB[0], { batRuns: 4 })
  await bowlDots(innings1.id, bowlersB, oversPerInnings * ballsPerOver - 1)

  const innings2 = await scoringService.createInnings({ matchId: scheduled.match_id, inningsNumber: 2, battingTeamId: teamBId, bowlingTeamId: teamAId })
  await scoringService.recordEvent({ inningsId: innings2.id, event: { eventType: 'batsman-in', payload: { end: 'strikerEnd', matchPlayerId: mpsB[0].id } } })
  await scoringService.recordEvent({ inningsId: innings2.id, event: { eventType: 'batsman-in', payload: { end: 'nonStrikerEnd', matchPlayerId: mpsB[1].id } } })
  const bowlersA = [mpsA[mpsA.length - 1], mpsA[mpsA.length - 2]]
  await bowl(innings2.id, bowlersA[0], { batRuns: 4 }) // matches team A's 4 exactly
  await bowlDots(innings2.id, bowlersA, oversPerInnings * ballsPerOver - 1)

  const finalized = await matchService.finalizeMatch(scheduled.match_id)
  await fixtureService.onMatchFinalized(scheduled.match_id)
  assert.equal(finalized.result_type, 'TIE', 'test setup sanity check')
  return finalized
}

test('GROUPS + KNOCKOUT — full pipeline: group stage -> qualification -> semis -> final -> champion', async () => {
  const staff = await createStaffUser()
  const t = await makeTournament(staff.id)
  const teams = await createTeamsWithSquads(4, 4) // 2 per group
  const matchIds = []
  try {
    await tournamentService.openRegistration(t.id)
    for (const team of teams) await tournamentService.registerTeam(t.id, { teamId: team.team.id })
    await fixtureService.generateFixtures(t.id) // auto-assigns groups A/B, alternating registration order

    const squadByTeamId = new Map(teams.map((x) => [x.team.id, x.players]))
    let fixtures = await fixtureService.listFixtures(t.id)
    const groupFixtures = fixtures.filter((f) => f.stage === 'GROUP')
    assert.equal(groupFixtures.length, 2, '2 teams per group -> 1 fixture per group x 2 groups')

    // Deterministic winners: teamA of each group fixture wins.
    for (const f of groupFixtures) {
      await playFixtureToWin(matchIds, f, f.team_a_id, squadByTeamId, { oversPerInnings: 1 })
    }

    // Group stage complete -> semis auto-generated.
    fixtures = await fixtureService.listFixtures(t.id)
    const semis = fixtures.filter((f) => f.stage === 'SEMI_FINAL')
    assert.equal(semis.length, 2, 'group stage completion must auto-generate exactly 2 semi-finals')

    // Idempotency: re-running progression must not duplicate the semis.
    await fixtureService.advanceTournament(t.id)
    const semisAfterReplay = (await fixtureService.listFixtures(t.id)).filter((f) => f.stage === 'SEMI_FINAL')
    assert.equal(semisAfterReplay.length, 2)

    for (const f of semis) {
      await playFixtureToWin(matchIds, f, f.team_a_id, squadByTeamId, { oversPerInnings: 1 })
    }

    fixtures = await fixtureService.listFixtures(t.id)
    const finals = fixtures.filter((f) => f.stage === 'FINAL')
    assert.equal(finals.length, 1, 'both semis resolved -> exactly one final must be generated')

    const finalMatch = await playFixtureToWin(matchIds, finals[0], finals[0].team_a_id, squadByTeamId, { oversPerInnings: 1 })

    const tournamentAfter = await repo.findTournamentById(t.id)
    assert.equal(tournamentAfter.status, 'COMPLETED')
    assert.equal(tournamentAfter.champion_team_id, finalMatch.winner_team_id)
  } finally {
    await cleanupTournamentTest({ tournamentIds: [t.id], matchIds, teamIds: teams.map((x) => x.team.id), playerIds: teams.flatMap((x) => x.players.map((p) => p.id)), userIds: [staff.id] })
  }
})

test('DIRECT KNOCKOUT — 4 teams: semis -> final -> champion, unsupported sizes rejected', async () => {
  const staff = await createStaffUser()
  const t = await makeTournament(staff.id, { format: 'KNOCKOUT' })
  const teams = await createTeamsWithSquads(4, 4)
  const matchIds = []
  try {
    await tournamentService.openRegistration(t.id)
    for (const team of teams) await tournamentService.registerTeam(t.id, { teamId: team.team.id })
    await fixtureService.generateFixtures(t.id)

    const squadByTeamId = new Map(teams.map((x) => [x.team.id, x.players]))
    let fixtures = await fixtureService.listFixtures(t.id)
    const semis = fixtures.filter((f) => f.stage === 'SEMI_FINAL')
    assert.equal(semis.length, 2, '4-team direct knockout starts at SEMI_FINAL, no QUARTER_FINAL')

    for (const f of semis) await playFixtureToWin(matchIds, f, f.team_a_id, squadByTeamId, { oversPerInnings: 1 })

    fixtures = await fixtureService.listFixtures(t.id)
    const finals = fixtures.filter((f) => f.stage === 'FINAL')
    assert.equal(finals.length, 1)
    const finalMatch = await playFixtureToWin(matchIds, finals[0], finals[0].team_a_id, squadByTeamId, { oversPerInnings: 1 })

    const tournamentAfter = await repo.findTournamentById(t.id)
    assert.equal(tournamentAfter.status, 'COMPLETED')
    assert.equal(tournamentAfter.champion_team_id, finalMatch.winner_team_id)
  } finally {
    await cleanupTournamentTest({ tournamentIds: [t.id], matchIds, teamIds: teams.map((x) => x.team.id), playerIds: teams.flatMap((x) => x.players.map((p) => p.id)), userIds: [staff.id] })
  }
})

test('KNOCKOUT TIE — a tied semi-final does NOT auto-advance a fake winner; explicit staff resolution unblocks it', async () => {
  const staff = await createStaffUser()
  const t = await makeTournament(staff.id, { format: 'KNOCKOUT' })
  const teams = await createTeamsWithSquads(4, 4)
  const matchIds = []
  try {
    await tournamentService.openRegistration(t.id)
    for (const team of teams) await tournamentService.registerTeam(t.id, { teamId: team.team.id })
    await fixtureService.generateFixtures(t.id)

    const squadByTeamId = new Map(teams.map((x) => [x.team.id, x.players]))
    const semis = (await fixtureService.listFixtures(t.id)).filter((f) => f.stage === 'SEMI_FINAL')

    await playFixtureToTie(matchIds, semis[0], squadByTeamId, { oversPerInnings: 1 })
    await playFixtureToWin(matchIds, semis[1], semis[1].team_a_id, squadByTeamId, { oversPerInnings: 1 })

    // Only one semi resolved -> the FINAL must NOT be generated yet.
    let finals = (await fixtureService.listFixtures(t.id)).filter((f) => f.stage === 'FINAL')
    assert.equal(finals.length, 0, 'a tied semi-final must block progression, never invent a winner')

    const tiedFixture = (await fixtureService.listFixtures(t.id)).find((f) => f.id === semis[0].id)
    assert.equal(tiedFixture.match_result_type, 'TIE')
    assert.equal(
      isFixtureResolved({ matchStatus: tiedFixture.match_status, resultType: tiedFixture.match_result_type, winnerTeamId: tiedFixture.match_winner_team_id, manualWinnerTeamId: tiedFixture.manual_result_winner_team_id }),
      false,
      'a finalized tie must not be considered resolved before manual resolution'
    )

    await assert.rejects(() => fixtureService.resolveFixtureManually(tiedFixture.id, { winnerTeamId: 999999999, byUserId: staff.id }), (err) => err.code === CODES.VALIDATION_ERROR)

    const resolved = await fixtureService.resolveFixtureManually(tiedFixture.id, { winnerTeamId: tiedFixture.team_a_id, byUserId: staff.id })
    assert.equal(resolved.manual_result_winner_team_id, tiedFixture.team_a_id)
    assert.equal(
      isFixtureResolved({ matchStatus: resolved.match_status, resultType: resolved.match_result_type, winnerTeamId: resolved.match_winner_team_id, manualWinnerTeamId: resolved.manual_result_winner_team_id }),
      true,
      'the manual override must now make it resolved'
    )

    finals = (await fixtureService.listFixtures(t.id)).filter((f) => f.stage === 'FINAL')
    assert.equal(finals.length, 1, 'manual resolution must unblock progression to the final')
    assert.ok([finals[0].team_a_id, finals[0].team_b_id].includes(tiedFixture.team_a_id))
  } finally {
    await cleanupTournamentTest({ tournamentIds: [t.id], matchIds, teamIds: teams.map((x) => x.team.id), playerIds: teams.flatMap((x) => x.players.map((p) => p.id)), userIds: [staff.id] })
  }
})

test('LEAGUE COMPLETION — champion is the final standings winner, only once every fixture is finalized', async () => {
  const staff = await createStaffUser()
  const t = await makeTournament(staff.id, { format: 'LEAGUE', oversPerInnings: 1 })
  const teams = await createTeamsWithSquads(2, 4)
  const matchIds = []
  try {
    await tournamentService.openRegistration(t.id)
    await tournamentService.registerTeam(t.id, { teamId: teams[0].team.id })
    await tournamentService.registerTeam(t.id, { teamId: teams[1].team.id })
    await fixtureService.generateFixtures(t.id)

    const [fixture] = await fixtureService.listFixtures(t.id)
    const squadByTeamId = new Map(teams.map((x) => [x.team.id, x.players]))

    await assert.rejects(() => fixtureService.completeLeagueTournament(t.id), (err) => err.code === CODES.INVALID_TOURNAMENT_STATE)

    const finalMatch = await playFixtureToWin(matchIds, fixture, fixture.team_a_id, squadByTeamId, { oversPerInnings: 1 })
    const completed = await fixtureService.completeLeagueTournament(t.id)
    assert.equal(completed.status, 'COMPLETED')
    assert.equal(completed.champion_team_id, finalMatch.winner_team_id)

    await assert.rejects(() => fixtureService.completeLeagueTournament(t.id), (err) => err.code === CODES.INVALID_TOURNAMENT_STATE)
  } finally {
    await cleanupTournamentTest({ tournamentIds: [t.id], matchIds, teamIds: teams.map((x) => x.team.id), playerIds: teams.flatMap((x) => x.players.map((p) => p.id)), userIds: [staff.id] })
  }
})
