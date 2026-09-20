// Integration tests — require the PostgreSQL database configured in .env.
// Every test creates its own fixture (teams/players/match/innings, prefixed
// "Integration Test") and deletes it in a `finally` block, so nothing is left
// behind in the shared database regardless of pass/fail.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'crypto'
import { pool } from '../../config/db.js'
import * as scoringService from '../../services/scoring.service.js'
import { createFixture } from './fixtures.js'
import { ScoringError } from '../../domain/scoring/errors.js'

test('records a delivery and the derived cache reload from PostgreSQL matches what the write returned', async () => {
  const fx = await createFixture()
  try {
    await fx.seatOpeners()
    const result = await scoringService.recordDelivery({
      inningsId: fx.inningsId,
      expectedVersion: 3, // 2 batsman-in events already bumped version to 3
      clientActionId: randomUUID(),
      input: { batRuns: 4, bowlerMatchPlayerId: fx.bowler1 },
    })
    assert.equal(result.state.runs, 4)
    assert.equal(result.delivery.total_runs ?? result.delivery.totalRuns, 4)

    // Reload from scratch — no reliance on anything held in process memory.
    const reloaded = await scoringService.getInningsState(fx.inningsId)
    assert.equal(reloaded.state.runs, 4)
    assert.equal(reloaded.state.batsmen[fx.rahul].runs, 4)
    assert.equal(reloaded.state.batsmen[fx.rahul].fours, 1)
    assert.equal(reloaded.innings.version, 4)
  } finally {
    await fx.cleanup()
  }
})

test('server-restart equivalent: record several deliveries then reconstruct purely from PostgreSQL', async () => {
  const fx = await createFixture()
  try {
    await fx.seatOpeners()
    for (const batRuns of [0, 1, 4, 1, 0, 2]) {
      const before = await scoringService.getInningsState(fx.inningsId)
      await scoringService.recordDelivery({
        inningsId: fx.inningsId,
        expectedVersion: before.innings.version,
        clientActionId: randomUUID(),
        input: { batRuns, bowlerMatchPlayerId: fx.bowler1 },
      })
    }

    // Nothing is cached anywhere in this process between calls — this IS the restart test.
    const reconstructed = await scoringService.getInningsState(fx.inningsId)
    assert.equal(reconstructed.state.runs, 8)
    assert.equal(reconstructed.state.legalBalls, 6)
    assert.deepEqual(
      reconstructed.state.deliveries.map((d) => d.strikerMatchPlayerId),
      [fx.rahul, fx.rahul, fx.aman, fx.aman, fx.rahul, fx.rahul]
    )
    assert.equal(reconstructed.state.ends.strikerEnd, fx.aman, 'aman should face the next over after this exact sequence')
  } finally {
    await fx.cleanup()
  }
})

test('idempotency: retrying the same clientActionId does not create a second delivery', async () => {
  const fx = await createFixture()
  try {
    await fx.seatOpeners()
    const clientActionId = randomUUID()
    const first = await scoringService.recordDelivery({
      inningsId: fx.inningsId,
      expectedVersion: 3,
      clientActionId,
      input: { batRuns: 6, bowlerMatchPlayerId: fx.bowler1 },
    })
    const retry = await scoringService.recordDelivery({
      inningsId: fx.inningsId,
      expectedVersion: 3, // stale on purpose — a real retry wouldn't know the version moved
      clientActionId,
      input: { batRuns: 6, bowlerMatchPlayerId: fx.bowler1 },
    })

    assert.equal(retry.idempotentReplay, true)
    assert.equal(String(retry.delivery.id), String(first.delivery.id))

    const { rows } = await pool.query('SELECT COUNT(*)::int AS count FROM deliveries WHERE innings_id = $1', [fx.inningsId])
    assert.equal(rows[0].count, 1)
  } finally {
    await fx.cleanup()
  }
})

test('optimistic concurrency: a stale expectedVersion is rejected with VERSION_CONFLICT, no delivery created', async () => {
  const fx = await createFixture()
  try {
    await fx.seatOpeners()
    // Client A records a FOUR, version 3 -> 4.
    await scoringService.recordDelivery({ inningsId: fx.inningsId, expectedVersion: 3, clientActionId: randomUUID(), input: { batRuns: 4, bowlerMatchPlayerId: fx.bowler1 } })

    // Client B still thinks version is 3 and tries a SIX.
    await assert.rejects(
      () =>
        scoringService.recordDelivery({
          inningsId: fx.inningsId,
          expectedVersion: 3,
          clientActionId: randomUUID(),
          input: { batRuns: 6, bowlerMatchPlayerId: fx.bowler1 },
        }),
      (err) => err instanceof ScoringError && err.code === 'VERSION_CONFLICT'
    )

    const { rows } = await pool.query('SELECT COUNT(*)::int AS count FROM deliveries WHERE innings_id = $1', [fx.inningsId])
    assert.equal(rows[0].count, 1, 'only the FOUR should exist — the stale SIX must not have been recorded')

    // Client B refreshes to version 4 and retries — should now succeed and move to version 5.
    const refreshed = await scoringService.getInningsState(fx.inningsId)
    assert.equal(refreshed.innings.version, 4)
    const retried = await scoringService.recordDelivery({
      inningsId: fx.inningsId,
      expectedVersion: 4,
      clientActionId: randomUUID(),
      input: { batRuns: 6, bowlerMatchPlayerId: fx.bowler1 },
    })
    assert.equal(retried.version, 5)
  } finally {
    await fx.cleanup()
  }
})

test('wicket persistence: run-out dismissed player is authoritative input, bowled dismissal is derived from replay', async () => {
  const fx = await createFixture()
  try {
    await fx.seatOpeners()

    const runOut = await scoringService.recordDelivery({
      inningsId: fx.inningsId,
      expectedVersion: 3,
      clientActionId: randomUUID(),
      input: { batRuns: 0, bowlerMatchPlayerId: fx.bowler1, wicket: { type: 'run-out', dismissedMatchPlayerId: fx.aman, runsCompleted: 0 } },
    })
    assert.equal(runOut.state.batsmen[fx.aman].out, true)

    const { rows: wicketRows } = await pool.query('SELECT * FROM wickets WHERE delivery_id = $1', [runOut.delivery.id])
    assert.equal(wicketRows[0].dismissal_type, 'run-out')
    assert.equal(wicketRows[0].dismissed_match_player_id, fx.aman)

    // Bring a replacement in for aman, then bowl the current striker (rahul).
    await scoringService.recordEvent({ inningsId: fx.inningsId, event: { eventType: 'batsman-in', payload: { end: 'nonStrikerEnd', matchPlayerId: fx.aman } } })
    const bowled = await scoringService.recordDelivery({
      inningsId: fx.inningsId,
      expectedVersion: 5,
      clientActionId: randomUUID(),
      input: { batRuns: 0, bowlerMatchPlayerId: fx.bowler1, wicket: { type: 'bowled' } },
    })
    const { rows: bowledWicketRows } = await pool.query('SELECT * FROM wickets WHERE delivery_id = $1', [bowled.delivery.id])
    assert.equal(bowledWicketRows[0].dismissal_type, 'bowled')
    assert.equal(bowledWicketRows[0].dismissed_match_player_id, fx.rahul, 'bowled always attributes to the current striker, derived by replay, not scorer input')
  } finally {
    await fx.cleanup()
  }
})

test('wagon wheel shot persists attached to the delivery and joins back to the correct batsman via the delivery cache', async () => {
  const fx = await createFixture()
  try {
    await fx.seatOpeners()
    const result = await scoringService.recordDelivery({
      inningsId: fx.inningsId,
      expectedVersion: 3,
      clientActionId: randomUUID(),
      input: { batRuns: 4, bowlerMatchPlayerId: fx.bowler1, shot: { normalizedX: 0.7, normalizedY: -0.4, angleDegrees: 260, regionId: 'cover' } },
    })
    const shots = await scoringService.listWagonWheelShots(fx.inningsId)
    assert.equal(shots.length, 1)
    assert.equal(String(shots[0].delivery_id), String(result.delivery.id))
    assert.equal(shots[0].striker_match_player_id, fx.rahul)
    assert.equal(Number(shots[0].normalized_x), 0.7)
  } finally {
    await fx.cleanup()
  }
})

test('configurable balls-per-over is honored end-to-end through persistence and replay', async () => {
  const fx = await createFixture({ ballsPerOver: 5 })
  try {
    await fx.seatOpeners()
    for (let i = 0; i < 5; i++) {
      const before = await scoringService.getInningsState(fx.inningsId)
      await scoringService.recordDelivery({ inningsId: fx.inningsId, expectedVersion: before.innings.version, clientActionId: randomUUID(), input: { batRuns: 0, bowlerMatchPlayerId: fx.bowler1 } })
    }
    const state = await scoringService.getInningsState(fx.inningsId)
    assert.equal(state.state.legalBalls, 5)
    assert.equal(state.state.overNumber, 1)
    assert.equal(state.state.ends.strikerEnd, fx.aman)
  } finally {
    await fx.cleanup()
  }
})
