// Priority 3 — LOC Cricket Records, exercised against real PostgreSQL through
// the actual service layer (same convention as statistics.integration.test.js:
// no HTTP, no mocks, explicit fixture/cleanup). Cannot run without a live DB
// (there is no separate test database for this project) — documented as not
// executed in the batch report.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pool } from '../../config/db.js'
import * as statisticsService from '../../services/statistics.service.js'
import { createTeamsFixture, playShortFinalizedMatch } from './fixtures.js'

test('CRICKET RECORDS — a finalized match appears in the team-total and victory-margin records with authoritative figures', async () => {
  const fx = await createTeamsFixture({ squadSize: 4 })
  try {
    const played = await playShortFinalizedMatch(fx) // team A bats first and wins by runs
    const finalInnings = (await pool.query('SELECT * FROM innings WHERE match_id = $1 ORDER BY innings_number', [played.matchId])).rows
    const matchRow = (await pool.query('SELECT * FROM matches WHERE id = $1', [played.matchId])).rows[0]

    const records = await statisticsService.getCricketRecords()

    // Highest team total — team A's first innings is in there, with the exact
    // innings.runs cache value (never a recomputed number).
    const ourTotal = records.highestTeamTotals.find((r) => r.matchId === played.matchId && r.team.id === fx.teamAId)
    assert.ok(ourTotal, 'team A first innings is listed among highest team totals')
    assert.equal(ourTotal.runs, finalInnings[0].runs)
    assert.equal(ourTotal.opponent.id, fx.teamBId)

    // Highest match aggregate — SUM of both innings for this match.
    const agg = records.highestMatchAggregates.find((r) => r.matchId === played.matchId)
    assert.ok(agg)
    assert.equal(agg.totalRuns, finalInnings[0].runs + finalInnings[1].runs)

    // Victory margin — this match was a RUNS win, so it belongs in
    // biggestWinsByRuns (not byWickets), with winner = team A.
    if (matchRow.result_type === 'RUNS') {
      const win = records.biggestWinsByRuns.find((r) => r.matchId === played.matchId)
      assert.ok(win, 'a RUNS-result finalized match is in biggestWinsByRuns')
      assert.equal(win.margin, matchRow.result_margin)
      assert.equal(win.marginUnit, 'runs')
      assert.equal(win.winner.id, fx.teamAId)
      assert.equal(win.loser.id, fx.teamBId)
      assert.ok(!records.biggestWinsByWickets.some((r) => r.matchId === played.matchId))
    }

    // No private fields anywhere in the payload.
    assert.ok(!/email|password|user_id/i.test(JSON.stringify(records)))
  } finally {
    await fx.cleanup()
  }
})

test('CRICKET RECORDS — every category is an array and figures are non-negative', async () => {
  const records = await statisticsService.getCricketRecords()
  for (const key of [
    'highestTeamTotals',
    'highestMatchAggregates',
    'biggestWinsByRuns',
    'biggestWinsByWickets',
    'highestSuccessfulChases',
  ]) {
    assert.ok(Array.isArray(records[key]), `${key} is an array`)
    assert.ok(records[key].length <= 5, `${key} is capped at the honour-roll limit`)
  }
  for (const r of records.highestTeamTotals) assert.ok(r.runs >= 0 && r.wickets >= 0)
  for (const r of records.biggestWinsByRuns) assert.ok(r.margin > 0 && r.winner && r.loser)
  for (const r of records.biggestWinsByWickets) assert.ok(r.margin > 0 && r.winner && r.loser)
})
