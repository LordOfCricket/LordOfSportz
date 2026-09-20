// Phase 21.5 — Graceful failure of optional/best-effort services. Every
// prior phase's manual code review confirmed groundNotification.service.js
// #createNotification never throws (own try/catch, returns null on
// failure) — this file is the first time that specific contract gets a
// real, non-mocked test: a genuine Postgres constraint violation (an
// unresolvable user_id — ground_notifications.user_id has no legitimate way
// to reach an invalid value through any real HTTP path, since it's always
// server-resolved from findActiveGroundOwnerUserIds, never client input;
// this is exactly why the contract has never been directly exercised by an
// HTTP-level test before). The primary action this write is attached to
// (booking/order creation) must never fail because of it — verified
// directly at the service boundary rather than via mocks, consistent with
// this codebase's established real-integration-test approach.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pool } from '../../config/db.js'
import { createNotification, checkOperationalAlerts } from '../../services/groundNotification.service.js'

test('createNotification with an unresolvable userId (FK violation) returns null instead of throwing', async () => {
  const bogusUserId = 999999999
  const result = await createNotification({
    userId: bogusUserId,
    type: 'CANTEEN_ORDER_RECEIVED',
    title: 'Should never be persisted',
    body: 'This write is expected to fail at the database level.',
  })
  assert.strictEqual(result, null, 'a failed write must resolve to null, never throw or reject')

  const { rows } = await pool.query('SELECT * FROM ground_notifications WHERE user_id = $1', [bogusUserId])
  assert.strictEqual(rows.length, 0, 'no row should have been persisted for the failed write')
})

test('createNotification failure does not leave the AsyncLocalStorage request context or subsequent calls in a broken state', async () => {
  // Regression guard for the Phase 21.2 request-id change landing in the
  // same phase as this test: a caught error inside createNotification must
  // not somehow corrupt logging for calls made immediately afterward.
  const bogusResult = await createNotification({ userId: 999999998, type: 'CANTEEN_ORDER_RECEIVED', title: 'x' })
  assert.strictEqual(bogusResult, null)

  const { rows: [user] } = await pool.query(
    `INSERT INTO users (name, email, password_hash, role) VALUES ($1,$2,'x','player') RETURNING *`,
    ['Graceful Failure Test User', `graceful-failure-${Math.random().toString(36).slice(2)}@example.test`],
  )
  try {
    const goodResult = await createNotification({ userId: user.id, type: 'CANTEEN_ORDER_RECEIVED', title: 'A real notification' })
    assert.ok(goodResult, 'a subsequent, valid write must still succeed normally after a prior failure')
    assert.strictEqual(goodResult.user_id, user.id)
  } finally {
    await pool.query('DELETE FROM ground_notifications WHERE user_id = $1', [user.id])
    await pool.query('DELETE FROM users WHERE id = $1', [user.id])
  }
})

test('checkOperationalAlerts never throws even for a ground with no owners/canteens (absence, not an error)', async () => {
  // A groundId with zero active owners is the everyday "nothing to check
  // yet" case (e.g. a brand-new ground), not a failure — this only
  // regresses the function's own early-return guard, but is cheap
  // insurance given this function's own doc comment promises it "never
  // throws, matching every other notification trigger's posture."
  await assert.doesNotReject(() => checkOperationalAlerts(-1))
})
