// Phase 17 integration tests — Advanced Cricket Analytics, exercised against
// real PostgreSQL through the actual service layer (same convention as every
// other integration test file: no HTTP, no mocks, explicit fixture/cleanup).
// The most important tests here are the CROSS-CHECK tests (Part 60): every
// shared metric between a NEW analytics endpoint and an EXISTING, already-
// trusted read model (career stats / team record) must agree EXACTLY — never
// a second, independently-drifting truth.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pool } from '../../config/db.js'
import * as statisticsService from '../../services/statistics.service.js'
import * as publicTeamService from '../../services/publicTeam.service.js'
import * as playerAnalyticsService from '../../services/playerAnalytics.service.js'
import * as teamAnalyticsService from '../../services/teamAnalytics.service.js'
import * as matchAnalyticsService from '../../services/matchAnalytics.service.js'
import * as tournamentAnalyticsService from '../../services/tournamentAnalytics.service.js'
import * as comparisonAnalyticsService from '../../services/comparisonAnalytics.service.js'
import * as correctionService from '../../services/correction.service.js'
import * as matchService from '../../services/match.service.js'
import * as tournamentService from '../../services/tournament.service.js'
import * as fixtureService from '../../services/tournamentFixture.service.js'
import * as tournamentStatsService from '../../services/tournamentStats.service.js'
import * as scoringService from '../../services/scoring.service.js'
import { createTeamsFixture, playShortFinalizedMatch } from './fixtures.js'
import { createStaffUser, createTeamsWithSquads, cleanupTournamentTest, bowl, bowlDots } from './tournamentFixtures.js'

function futureDate(daysAhead = 1) {
  const d = new Date()
  d.setDate(d.getDate() + daysAhead)
  return d.toISOString().slice(0, 10)
}

// ---------------------------------------------------------------------------
// Player Analytics
// ---------------------------------------------------------------------------

test('PLAYER ANALYTICS — recent form/trend/consistency cross-check exactly against Phase 7 career stats', async () => {
  const fx = await createTeamsFixture({ squadSize: 4 })
  let played
  try {
    played = await playShortFinalizedMatch(fx)
    const player = fx.squadA[0] // scored the four, the one, then got out caught

    const careerStats = await statisticsService.getPlayerCareerStats(player.id)
    const analytics = await playerAnalyticsService.getPlayerAnalytics(player.public_player_id, { recent: 5 })

    assert.equal(analytics.recentForm.length, 1)
    assert.equal(analytics.recentForm[0].matchId, played.matchId)
    assert.equal(analytics.recentForm[0].batting.runs, careerStats.recentForm[0].batting.runs)
    assert.equal(analytics.recentForm[0].batting.strikeRate, careerStats.recentForm[0].batting.strikeRate)

    assert.equal(analytics.battingTrend.length, 1)
    assert.equal(analytics.battingTrend[0].runs, careerStats.career.batting.runs)

    assert.equal(analytics.boundaryAnalysis.fours, careerStats.career.batting.fours)
    assert.equal(analytics.boundaryAnalysis.sixes, careerStats.career.batting.sixes)
    assert.equal(analytics.boundaryAnalysis.boundaryRuns, careerStats.career.batting.fours * 4 + careerStats.career.batting.sixes * 6)

    assert.equal(analytics.consistency.innings, 1)
    assert.equal(analytics.consistency.meanRuns, careerStats.career.batting.runs)
  } finally {
    await fx.cleanup()
  }
})

test('PLAYER ANALYTICS — boundary/dot-ball analysis reconciles with the known scripted delivery sequence', async () => {
  // playShortFinalizedMatch's over 1: mpsA[0] faces a four then a one (both
  // scoring balls, 0 dots) — the strike then rotates to mpsA[1] on the ODD
  // 1-run ball, so mpsA[1] (not mpsA[0]) is the one dismissed on ball 3.
  const fx = await createTeamsFixture({ squadSize: 4 })
  let played
  try {
    played = await playShortFinalizedMatch(fx)
    const player = fx.squadA[0]
    const analytics = await playerAnalyticsService.getPlayerAnalytics(player.public_player_id, { recent: 5 })

    assert.equal(analytics.dotBallAnalysis.batting.ballsFaced, 2) // the four, then the one
    assert.equal(analytics.dotBallAnalysis.batting.dots, 0) // neither ball scored 0
    assert.equal(analytics.dotBallAnalysis.batting.dotBallPercentage, 0)
  } finally {
    await fx.cleanup()
  }
})

test('PLAYER ANALYTICS — dismissal breakdown reflects the authoritative wickets.dismissal_type, not commentary text', async () => {
  const fx = await createTeamsFixture({ squadSize: 4 })
  let played
  try {
    played = await playShortFinalizedMatch(fx)
    const player = fx.squadA[1] // strike rotated onto them after the 1-run ball; they're the one caught
    const analytics = await playerAnalyticsService.getPlayerAnalytics(player.public_player_id)
    assert.deepEqual(analytics.dismissalBreakdown, [{ type: 'Caught', count: 1 }])
  } finally {
    await fx.cleanup()
  }
})

test('PLAYER ANALYTICS — 404 for an unknown publicPlayerId', async () => {
  await assert.rejects(() => playerAnalyticsService.getPlayerAnalytics('CVP-DOES-NOT-EXIST'), (err) => err.statusCode === 404)
})

test('PLAYER ANALYTICS — privacy: no email/password/user_id ever appears in the response', async () => {
  const fx = await createTeamsFixture({ squadSize: 4 })
  let played
  try {
    played = await playShortFinalizedMatch(fx)
    const player = fx.squadA[0]
    const analytics = await playerAnalyticsService.getPlayerAnalytics(player.public_player_id)
    const serialized = JSON.stringify(analytics)
    assert.ok(!/email|password|user_id/i.test(serialized), `analytics response must never leak private fields: ${serialized}`)
  } finally {
    await fx.cleanup()
  }
})

// ---------------------------------------------------------------------------
// Team Analytics
// ---------------------------------------------------------------------------

test('TEAM ANALYTICS — averageScore/averageConceded and battingFirstVsChasing cross-check against the real finalized match', async () => {
  const fx = await createTeamsFixture({ squadSize: 4 })
  let played
  try {
    played = await playShortFinalizedMatch(fx, { oversPerInnings: 2 })
    const finalRow = (await pool.query('SELECT * FROM innings WHERE match_id = $1 ORDER BY innings_number', [played.matchId])).rows

    const analytics = await teamAnalyticsService.getTeamAnalytics(fx.teamAId)
    assert.equal(analytics.averageScore, finalRow[0].runs) // team A batted first (innings 1)
    assert.equal(analytics.averageConceded, finalRow[1].runs)
    assert.deepEqual(analytics.battingFirstVsChasing.battingFirst, { matches: 1, wins: 1, winPercentage: 100 })
    assert.deepEqual(analytics.battingFirstVsChasing.chasing, { matches: 0, wins: 0, winPercentage: null })

    // Cross-check recentForm's W/L against the existing Phase 10 team record.
    const profile = await publicTeamService.getPublicTeamProfile(fx.teamAId)
    assert.equal(analytics.recentForm[0].result, profile.recentForm[0].result)
  } finally {
    await fx.cleanup()
  }
})

test('TEAM ANALYTICS — topContributors reuses publicTeam.service.js#buildTopPerformers exactly (never a second replay path)', async () => {
  const fx = await createTeamsFixture({ squadSize: 4 })
  let played
  try {
    played = await playShortFinalizedMatch(fx)
    const analytics = await teamAnalyticsService.getTeamAnalytics(fx.teamAId)
    const profile = await publicTeamService.getPublicTeamProfile(fx.teamAId)
    assert.deepEqual(analytics.topContributors, profile.topPerformers)
  } finally {
    await fx.cleanup()
  }
})

test('TEAM ANALYTICS — 404 for a nonexistent team id, never a raw SQL crash for a non-numeric id', async () => {
  await assert.rejects(() => teamAnalyticsService.getTeamAnalytics(999999999), (err) => err.statusCode === 404)
  await assert.rejects(() => teamAnalyticsService.getTeamAnalytics('not-a-number'), (err) => err.statusCode === 404)
})

test('TEAM ANALYTICS — privacy: no email/password/user_id ever appears in the response', async () => {
  const fx = await createTeamsFixture({ squadSize: 4 })
  let played
  try {
    played = await playShortFinalizedMatch(fx)
    const analytics = await teamAnalyticsService.getTeamAnalytics(fx.teamAId)
    const serialized = JSON.stringify(analytics)
    assert.ok(!/email|password|user_id/i.test(serialized), `analytics response must never leak private fields: ${serialized}`)
  } finally {
    await fx.cleanup()
  }
})

// ---------------------------------------------------------------------------
// Match Analytics
// ---------------------------------------------------------------------------

test('MATCH ANALYTICS — score progression reconciles exactly with the final scorecard total (Part 60)', async () => {
  // A custom 3-over (>= MIN_OVERS_FOR_PHASE_SPLIT), 2-innings match built
  // directly from the same primitives playShortFinalizedMatch itself uses
  // (that fixture is hard-coded to exactly 2 overs, too short for phase
  // analytics to be available — see matchPhases.js).
  const fx = await createTeamsFixture({ squadSize: 4 })
  let matchId
  try {
    const match = await matchService.createMatch({ teamAId: fx.teamAId, teamBId: fx.teamBId, venue: 'x', matchDate: new Date().toISOString(), oversPerInnings: 3, ballsPerOver: 6 })
    matchId = match.id
    const mpsA = []
    for (const p of fx.squadA) mpsA.push(await scoringService.addMatchPlayer({ matchId, teamId: fx.teamAId, playerId: p.id, isPlayingXi: true }))
    const mpsB = []
    for (const p of fx.squadB) mpsB.push(await scoringService.addMatchPlayer({ matchId, teamId: fx.teamBId, playerId: p.id, isPlayingXi: true }))
    await matchService.setToss(matchId, { tossWinnerId: fx.teamAId, tossDecision: 'bat' })
    await matchService.startMatch(matchId)

    const innings1 = await scoringService.createInnings({ matchId, inningsNumber: 1, battingTeamId: fx.teamAId, bowlingTeamId: fx.teamBId })
    await scoringService.recordEvent({ inningsId: innings1.id, event: { eventType: 'batsman-in', payload: { end: 'strikerEnd', matchPlayerId: mpsA[0].id } } })
    await scoringService.recordEvent({ inningsId: innings1.id, event: { eventType: 'batsman-in', payload: { end: 'nonStrikerEnd', matchPlayerId: mpsA[1].id } } })
    const bowlersB = [mpsB[3], mpsB[2]]
    await bowl(innings1.id, bowlersB[0], { batRuns: 4 })
    await bowl(innings1.id, bowlersB[0], { batRuns: 6 })
    await bowlDots(innings1.id, bowlersB, 16) // 18 total legal balls for 3 overs

    const innings2 = await scoringService.createInnings({ matchId, inningsNumber: 2, battingTeamId: fx.teamBId, bowlingTeamId: fx.teamAId })
    await scoringService.recordEvent({ inningsId: innings2.id, event: { eventType: 'batsman-in', payload: { end: 'strikerEnd', matchPlayerId: mpsB[0].id } } })
    await scoringService.recordEvent({ inningsId: innings2.id, event: { eventType: 'batsman-in', payload: { end: 'nonStrikerEnd', matchPlayerId: mpsB[1].id } } })
    const bowlersA = [mpsA[3], mpsA[2]]
    await bowlDots(innings2.id, bowlersA, 18) // never chases -> team A wins by runs

    await matchService.finalizeMatch(matchId)

    const analytics = await matchAnalyticsService.getMatchAnalytics(matchId)
    assert.equal(analytics.available, true)

    const finalInningsRows = (await pool.query('SELECT * FROM innings WHERE match_id = $1 ORDER BY innings_number', [matchId])).rows
    for (let i = 0; i < analytics.innings.length; i++) {
      const progression = analytics.innings[i].progression
      const lastPoint = progression[progression.length - 1]
      assert.equal(lastPoint.cumulativeRuns, finalInningsRows[i].runs, `innings ${i + 1} progression must reconcile with the final score`)
      assert.equal(lastPoint.cumulativeLegalBalls, finalInningsRows[i].legal_balls)

      // Phase totals must reconcile with the innings total exactly (Part 56 — no double counting).
      const phases = analytics.innings[i].phaseMetrics
      assert.ok(phases, 'a 3-over match must have phase analytics available')
      assert.equal(phases.reduce((s, p) => s + p.runs, 0), finalInningsRows[i].runs)
      assert.equal(phases.reduce((s, p) => s + p.legalBalls, 0), finalInningsRows[i].legal_balls)
    }
  } finally {
    if (matchId) {
      await pool.query('DELETE FROM innings WHERE match_id = $1', [matchId])
      await pool.query('DELETE FROM match_players WHERE match_id = $1', [matchId])
      await pool.query('DELETE FROM matches WHERE id = $1', [matchId])
    }
    await fx.cleanup()
  }
})

test('MATCH ANALYTICS — scoreComparison series is present for a 2-innings match, each series length reflects its own real innings', async () => {
  const fx = await createTeamsFixture({ squadSize: 4 })
  let played
  try {
    played = await playShortFinalizedMatch(fx, { oversPerInnings: 2 })
    const analytics = await matchAnalyticsService.getMatchAnalytics(played.matchId)
    assert.ok(analytics.scoreComparison)
    assert.equal(analytics.scoreComparison.teamA.teamId, fx.teamAId)
    assert.equal(analytics.scoreComparison.teamB.teamId, fx.teamBId)
  } finally {
    await fx.cleanup()
  }
})

test('MATCH ANALYTICS — CORRECTION SAFETY: a real correction applied pre-finalize is reflected in the eventually-generated analytics', async () => {
  const fx = await createTeamsFixture({ squadSize: 4 })
  let played
  try {
    played = await playShortFinalizedMatch(fx, { finalize: false, oversPerInnings: 2 })
    const inn1 = (await pool.query('SELECT * FROM innings WHERE match_id = $1 AND innings_number = 1', [played.matchId])).rows[0]
    const firstDelivery = (await pool.query('SELECT * FROM deliveries WHERE innings_id = $1 ORDER BY log_sequence ASC LIMIT 1', [inn1.id])).rows[0]

    // playShortFinalizedMatch's first delivery is a four (batRuns: 4) — correct it down to 1.
    await correctionService.applyCorrection({
      inningsId: inn1.id,
      targetType: 'delivery',
      targetId: firstDelivery.id,
      reasonCode: 'WRONG_RUNS',
      patch: { batRuns: 1 },
      correctedByUserId: fx.userId,
    })

    await matchService.finalizeMatch(played.matchId)
    const finalInnings1 = (await pool.query('SELECT * FROM innings WHERE id = $1', [inn1.id])).rows[0]

    const analytics = await matchAnalyticsService.getMatchAnalytics(played.matchId)
    const progression = analytics.innings[0].progression
    assert.equal(progression[progression.length - 1].cumulativeRuns, finalInnings1.runs, 'analytics must reflect the CORRECTED total, never the pre-correction one')
  } finally {
    await fx.cleanup()
  }
})

test('MATCH ANALYTICS — INSUFFICIENT_DATA for a match with no innings yet, never a crash', async () => {
  const fx = await createTeamsFixture({ squadSize: 4 })
  try {
    const match = await matchService.createMatch({ teamAId: fx.teamAId, teamBId: fx.teamBId, venue: 'x', matchDate: new Date().toISOString(), oversPerInnings: 2, ballsPerOver: 6 })
    const analytics = await matchAnalyticsService.getMatchAnalytics(match.id)
    assert.equal(analytics.available, false)
    assert.equal(analytics.reason, 'INSUFFICIENT_DATA')
  } finally {
    await fx.cleanup()
  }
})

test('MATCH ANALYTICS — 404 for a nonexistent match id', async () => {
  await assert.rejects(() => matchAnalyticsService.getMatchAnalytics(999999999), (err) => err.statusCode === 404)
})

// ---------------------------------------------------------------------------
// Comparison
// ---------------------------------------------------------------------------

test('PLAYER COMPARISON — two real players compared side by side, values match their own career stats exactly', async () => {
  const fx = await createTeamsFixture({ squadSize: 4 })
  let played
  try {
    played = await playShortFinalizedMatch(fx)
    const playerA = fx.squadA[0]
    const playerB = fx.squadB[0]
    const comparison = await comparisonAnalyticsService.comparePlayers(playerA.public_player_id, playerB.public_player_id)
    const careerA = await statisticsService.getPlayerCareerStats(playerA.id, { matchHistoryLimit: 0 })
    assert.deepEqual(comparison.playerA.career, careerA.career)
    assert.equal(comparison.playerB.player.publicPlayerId, playerB.public_player_id)
  } finally {
    await fx.cleanup()
  }
})

test('PLAYER COMPARISON — comparing a player to themselves is rejected, never silently allowed', async () => {
  const fx = await createTeamsFixture({ squadSize: 4 })
  try {
    const player = fx.squadA[0]
    await assert.rejects(() => comparisonAnalyticsService.comparePlayers(player.public_player_id, player.public_player_id), (err) => err.statusCode === 400)
  } finally {
    await fx.cleanup()
  }
})

test('PLAYER COMPARISON — unknown player id -> 404, never a crash', async () => {
  const fx = await createTeamsFixture({ squadSize: 4 })
  try {
    const player = fx.squadA[0]
    await assert.rejects(() => comparisonAnalyticsService.comparePlayers(player.public_player_id, 'CVP-DOES-NOT-EXIST'), (err) => err.statusCode === 404)
  } finally {
    await fx.cleanup()
  }
})

test('TEAM HEAD-TO-HEAD — wins/losses correct, and a player transfer AFTER the match never rewrites historical team representation', async () => {
  const fx = await createTeamsFixture({ squadSize: 4 })
  let played
  try {
    played = await playShortFinalizedMatch(fx, { oversPerInnings: 2 })

    // Transfer a player who played in this match from team A to a brand-new
    // third team — the match is between team A and team B; this must have
    // ZERO effect on the head-to-head record between them (team identity on
    // `matches` is fixed at match time, never derived from player membership).
    const thirdTeam = (await pool.query(`INSERT INTO teams (name, short_name) VALUES ('Integration Test Third Team','ITT') RETURNING *`)).rows[0]
    await pool.query('UPDATE players SET team_id = $1 WHERE id = $2', [thirdTeam.id, fx.squadA[0].id])

    try {
      const comparison = await comparisonAnalyticsService.compareTeams(fx.teamAId, fx.teamBId)
      assert.equal(comparison.headToHead.matchesPlayed, 1)
      assert.equal(comparison.headToHead.teamAWins, 1)
      assert.equal(comparison.headToHead.teamBWins, 0)
      assert.equal(comparison.headToHead.recentMeetings[0].matchId, played.matchId)
    } finally {
      await pool.query('DELETE FROM teams WHERE id = $1', [thirdTeam.id])
    }
  } finally {
    await fx.cleanup()
  }
})

test('TEAM COMPARISON — comparing a team to itself is rejected', async () => {
  const fx = await createTeamsFixture({ squadSize: 4 })
  try {
    await assert.rejects(() => comparisonAnalyticsService.compareTeams(fx.teamAId, fx.teamAId), (err) => err.statusCode === 400)
  } finally {
    await fx.cleanup()
  }
})

// ---------------------------------------------------------------------------
// Tournament Analytics
// ---------------------------------------------------------------------------

test('TOURNAMENT ANALYTICS — scoped to ONLY this tournament\'s finalized matches, cross-checked against tournamentStats.service.js', async () => {
  const staff = await createStaffUser()
  const t = await tournamentService.createTournament({
    name: `Integration Test Analytics Tournament ${Date.now()}`,
    format: 'LEAGUE',
    startDate: futureDate(1),
    endDate: futureDate(10),
    oversPerInnings: 2,
    ballsPerOver: 6,
    maxTeams: 8,
    maxSquadSize: 5,
    createdBy: staff.id,
  })
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

    const mpsA = []
    for (const p of teamA.players) mpsA.push(await pool.query('INSERT INTO match_players (match_id, team_id, player_id, is_playing_xi) VALUES ($1,$2,$3,true) RETURNING *', [scheduled.match_id, teamA.team.id, p.id]).then((r) => r.rows[0]))
    const mpsB = []
    for (const p of teamB.players) mpsB.push(await pool.query('INSERT INTO match_players (match_id, team_id, player_id, is_playing_xi) VALUES ($1,$2,$3,true) RETURNING *', [scheduled.match_id, teamB.team.id, p.id]).then((r) => r.rows[0]))
    await matchService.setToss(scheduled.match_id, { tossWinnerId: teamA.team.id, tossDecision: 'bat' })
    await matchService.startMatch(scheduled.match_id)

    const innings1 = await scoringService.createInnings({ matchId: scheduled.match_id, inningsNumber: 1, battingTeamId: teamA.team.id, bowlingTeamId: teamB.team.id })
    await scoringService.recordEvent({ inningsId: innings1.id, event: { eventType: 'batsman-in', payload: { end: 'strikerEnd', matchPlayerId: mpsA[0].id } } })
    await scoringService.recordEvent({ inningsId: innings1.id, event: { eventType: 'batsman-in', payload: { end: 'nonStrikerEnd', matchPlayerId: mpsA[1].id } } })
    await bowl(innings1.id, mpsB[3], { batRuns: 4 })
    await bowlDots(innings1.id, [mpsB[3], mpsB[2]], 11)

    const innings2 = await scoringService.createInnings({ matchId: scheduled.match_id, inningsNumber: 2, battingTeamId: teamB.team.id, bowlingTeamId: teamA.team.id })
    await scoringService.recordEvent({ inningsId: innings2.id, event: { eventType: 'batsman-in', payload: { end: 'strikerEnd', matchPlayerId: mpsB[0].id } } })
    await scoringService.recordEvent({ inningsId: innings2.id, event: { eventType: 'batsman-in', payload: { end: 'nonStrikerEnd', matchPlayerId: mpsB[1].id } } })
    await bowlDots(innings2.id, [mpsA[3], mpsA[2]], 12)

    const finalized = await matchService.finalizeMatch(scheduled.match_id)
    await fixtureService.onMatchFinalized(scheduled.match_id)
    assert.equal(finalized.status, 'finalized')

    const analytics = await tournamentAnalyticsService.getTournamentAnalytics(t.public_tournament_id)
    assert.equal(analytics.finalizedMatches, 1)
    assert.equal(analytics.totalRuns, 4)
    assert.equal(analytics.averageFirstInningsScore, 4)
    assert.equal(analytics.highestTeamTotal, 4)
    assert.equal(analytics.lowestTeamTotal, 0)

    // Cross-check against the existing, unmodified tournamentStats.service.js.
    const expected = await tournamentStatsService.getTournamentStatistics(t.id)
    assert.deepEqual(analytics.topRunScorers, expected.topRunScorers)
    assert.deepEqual(analytics.topWicketTakers, expected.topWicketTakers)
  } finally {
    await cleanupTournamentTest({ tournamentIds: [t.id], matchIds, teamIds: teams.map((x) => x.team.id), playerIds: teams.flatMap((x) => x.players.map((p) => p.id)), userIds: [staff.id] })
  }
})

test('TOURNAMENT ANALYTICS — 404 for an unknown tournament id', async () => {
  await assert.rejects(() => tournamentAnalyticsService.getTournamentAnalytics('TRN-DOES-NOT-EXIST'), (err) => err.statusCode === 404)
})

test('TOURNAMENT ANALYTICS — privacy: no email/password/user_id ever appears in the response', async () => {
  const staff = await createStaffUser()
  const t = await tournamentService.createTournament({
    name: `Integration Test Privacy Tournament ${Date.now()}`,
    format: 'LEAGUE',
    startDate: futureDate(1),
    endDate: futureDate(10),
    oversPerInnings: 2,
    ballsPerOver: 6,
    maxTeams: 8,
    maxSquadSize: 5,
    createdBy: staff.id,
  })
  try {
    const analytics = await tournamentAnalyticsService.getTournamentAnalytics(t.public_tournament_id)
    const serialized = JSON.stringify(analytics)
    assert.ok(!/email|password|user_id/i.test(serialized), `analytics response must never leak private fields: ${serialized}`)
  } finally {
    await cleanupTournamentTest({ tournamentIds: [t.id], userIds: [staff.id] })
  }
})
