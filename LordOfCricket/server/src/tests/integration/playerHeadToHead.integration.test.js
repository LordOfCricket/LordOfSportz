// Priority 2 — Player Head-to-Head + Career-vs-Recent, exercised against real
// PostgreSQL through the actual service layer (same convention as
// analytics.integration.test.js: no HTTP, no mocks, explicit fixture/cleanup).
//
// playShortFinalizedMatch's over 1 is bowled entirely by fx.squadB[3] (the
// designated BOWLER; bowlersB = [mpsB[3], mpsB[2]]). Scripted:
//   ball 1  squadA[0] hits 4   (strike stays)
//   ball 2  squadA[0] takes 1  (strike rotates to squadA[1])
//   ball 3  squadA[1] caught off squadB[3]
//   ball 4  squadA[2] dot
//   ball 5  squadA[2] hits 6
//   ball 6  squadA[2] takes 1
// So squadA[0] vs squadB[3] is a REAL encounter: 2 balls, 5 runs, 1 four,
// 0 sixes, 0 dismissals — hand-computable and stable.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as statisticsService from '../../services/statistics.service.js'
import * as comparisonAnalyticsService from '../../services/comparisonAnalytics.service.js'
import * as playerAnalyticsService from '../../services/playerAnalytics.service.js'
import { createTeamsFixture, playShortFinalizedMatch } from './fixtures.js'

test('HEAD-TO-HEAD — real batter-vs-bowler encounter reconciles with the scripted delivery sequence', async () => {
  const fx = await createTeamsFixture({ squadSize: 4 })
  try {
    const played = await playShortFinalizedMatch(fx)
    const batter = fx.squadA[0] // faced the four and the one off squadB[3]
    const bowler = fx.squadB[3] // bowled the whole of over 1

    const h2h = await comparisonAnalyticsService.headToHeadPlayers(batter.public_player_id, bowler.public_player_id)

    assert.equal(h2h.playerA.publicPlayerId, batter.public_player_id)
    assert.equal(h2h.playerB.publicPlayerId, bowler.public_player_id)
    assert.equal(h2h.matchesPlayed, 1)
    assert.equal(h2h.meetings.length, 1)
    assert.equal(h2h.meetings[0].matchId, played.matchId)

    // A batting vs B bowling — the two scoring balls squadA[0] faced.
    assert.equal(h2h.aVsB.batting.runs, 5)
    assert.equal(h2h.aVsB.batting.ballsFaced, 2)
    assert.equal(h2h.aVsB.batting.fours, 1)
    assert.equal(h2h.aVsB.batting.sixes, 0)
    assert.equal(h2h.aVsB.batting.dismissals, 0)
    assert.equal(h2h.aVsB.batting.dots, 0)

    // Same delivery set from the bowler's side: byes/leg-byes excluded, but
    // there were none, so runs conceded == runs off the bat here.
    assert.equal(h2h.bVsA.bowling.runsConceded, 5)
    assert.equal(h2h.bVsA.bowling.legalBalls, 2)
    assert.equal(h2h.bVsA.bowling.wickets, 0)

    // squadA[0] never bowled and squadB[3] never batted -> the reverse
    // direction is genuinely empty, not fabricated.
    assert.equal(h2h.bVsA.batting.runs, 0)
    assert.equal(h2h.bVsA.batting.ballsFaced, 0)
    assert.equal(h2h.aVsB.bowling.legalBalls, 0)
    assert.equal(h2h.aVsB.bowling.wickets, 0)
  } finally {
    await fx.cleanup()
  }
})

test('HEAD-TO-HEAD — two players who never shared a finalized match get an honest zero, not invented encounters', async () => {
  const fxOne = await createTeamsFixture({ squadSize: 4 })
  const fxTwo = await createTeamsFixture({ squadSize: 4 })
  try {
    await playShortFinalizedMatch(fxOne)
    await playShortFinalizedMatch(fxTwo)
    // A player from the first fixture's match vs a player from the second's —
    // both have finalized-match history, but never against each other.
    const h2h = await comparisonAnalyticsService.headToHeadPlayers(
      fxOne.squadA[0].public_player_id,
      fxTwo.squadB[0].public_player_id
    )
    assert.equal(h2h.matchesPlayed, 0)
    assert.deepEqual(h2h.meetings, [])
    assert.equal(h2h.aVsB.batting.runs, 0)
    assert.equal(h2h.aVsB.batting.average, null)
    assert.equal(h2h.aVsB.batting.strikeRate, null)
    assert.equal(h2h.bVsA.bowling.economy, null)
    assert.equal(h2h.bVsA.bowling.average, null)
  } finally {
    await fxOne.cleanup()
    await fxTwo.cleanup()
  }
})

test('HEAD-TO-HEAD — self and unknown ids are rejected, never silently answered', async () => {
  const fx = await createTeamsFixture({ squadSize: 2 })
  try {
    const player = fx.squadA[0]
    await assert.rejects(
      () => comparisonAnalyticsService.headToHeadPlayers(player.public_player_id, player.public_player_id),
      (err) => err.statusCode === 400
    )
    await assert.rejects(
      () => comparisonAnalyticsService.headToHeadPlayers(player.public_player_id, 'CVP-DOES-NOT-EXIST'),
      (err) => err.statusCode === 404
    )
  } finally {
    await fx.cleanup()
  }
})

test('HEAD-TO-HEAD — privacy: no email/password/user_id ever appears in the response', async () => {
  const fx = await createTeamsFixture({ squadSize: 4 })
  try {
    await playShortFinalizedMatch(fx)
    const h2h = await comparisonAnalyticsService.headToHeadPlayers(
      fx.squadA[0].public_player_id,
      fx.squadB[3].public_player_id
    )
    const serialized = JSON.stringify(h2h)
    assert.ok(!/email|password|user_id/i.test(serialized), `head-to-head response must never leak private fields: ${serialized}`)
  } finally {
    await fx.cleanup()
  }
})

test('CAREER VS RECENT — the recent block is the backend aggregate over the recent window; career mirrors getPlayerCareerStats exactly', async () => {
  const fx = await createTeamsFixture({ squadSize: 4 })
  try {
    const played = await playShortFinalizedMatch(fx)
    const player = fx.squadA[0]

    const careerStats = await statisticsService.getPlayerCareerStats(player.id)
    const analytics = await playerAnalyticsService.getPlayerAnalytics(player.public_player_id, { recent: 5 })

    assert.ok(analytics.careerVsRecent, 'careerVsRecent block is returned')
    // career side is the SAME object as the trusted career read model — not a
    // second, independently-drifting computation.
    assert.deepEqual(analytics.careerVsRecent.career.batting, careerStats.career.batting)
    assert.deepEqual(analytics.careerVsRecent.career.bowling, careerStats.career.bowling)
    assert.equal(analytics.careerVsRecent.career.matches, careerStats.career.matches)

    // recent side aggregates only the recent-N finalized window (1 match here).
    assert.equal(analytics.careerVsRecent.recentMatches, analytics.recentForm.length)
    assert.equal(analytics.careerVsRecent.recent.matches, analytics.recentForm.length)
    const trendRuns = analytics.battingTrend.reduce((s, m) => s + m.runs, 0)
    assert.equal(analytics.careerVsRecent.recent.batting.runs, trendRuns)
    assert.equal(played.matchId, analytics.recentForm[0].matchId)
  } finally {
    await fx.cleanup()
  }
})
