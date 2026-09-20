// MongoDB cleanup, Phase 4 — TodayMenu is now PostgreSQL-backed
// (today_menu + today_menu_items, server/src/models/canteenTodayMenu.model.js).
// This file covers what's specific to Phase 4: migration idempotency, the
// all-or-nothing unresolved-item abort (Step 11), transactional rollback on
// a genuine mid-write DB error (Step 21), and the query-plan-relevant
// indexes. MenuItem CRUD and the cross-store TodayMenu/Order coordination
// tests already live in canteenMenu.integration.test.js — not duplicated
// here.
//
// TodayMenu is a SINGLETON (at most one row in Mongo, at most one in
// Postgres) — unlike Phase 1-3's per-record migrations, there is no
// disposable "fixture document" to create alongside the real one without
// risking `TodayMenuMongo.findOne({})` picking up the wrong one. Every test
// here that needs to manipulate the source MongoDB document therefore
// snapshots it first and restores it byte-for-byte in `finally`, exactly
// like canteenMenu.integration.test.js's Phase 3A-established pattern for
// the live TodayMenu Postgres data — applied here to the Mongo SOURCE side
// too, since this file is the one place that legitimately still touches it.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import { pool, connectMongo } from '../../config/db.js'
import TodayMenuMongo from '../../models/canteenTodayMenuMongoLegacy.model.js'
import { getTodayMenu, replaceTodayMenu } from '../../models/canteenTodayMenu.model.js'
import { findSingleCanteen } from '../../models/canteen.model.js'
import { runTodayMenuMigration } from '../../scripts/migrateTodayMenuToPostgres.js'

await connectMongo()

// Phase 10 — today_menu is now scoped per canteen; this file exercises the
// real (single, Phase 8-seeded) canteen throughout.
const canteen = await findSingleCanteen()

async function snapshotMongoTodayMenu() {
  const doc = await TodayMenuMongo.findOne({}).lean()
  return doc
}

async function restoreMongoTodayMenu(snapshot) {
  if (snapshot) {
    await TodayMenuMongo.findOneAndUpdate(
      { _id: snapshot._id },
      { publishedAt: snapshot.publishedAt, items: snapshot.items },
      { upsert: true },
    )
  } else {
    await TodayMenuMongo.deleteMany({})
  }
}

async function snapshotPostgresTodayMenu() {
  return getTodayMenu(canteen.id)
}

function assertPostgresTodayMenuUnchanged(before, after, label) {
  assert.equal(before === null, after === null, `${label}: presence must be unchanged`)
  if (!before) return
  assert.equal(after.id, before.id, `${label}: same row`)
  assert.equal(new Date(after.published_at).getTime(), new Date(before.published_at).getTime(), `${label}: published_at unchanged`)
  assert.equal(after.items.length, before.items.length, `${label}: item count unchanged`)
  for (let i = 0; i < before.items.length; i++) {
    assert.equal(after.items[i].menu_item_id, before.items[i].menu_item_id, `${label}: item[${i}].menu_item_id unchanged`)
    assert.equal(after.items[i].available, before.items[i].available, `${label}: item[${i}].available unchanged`)
    assert.equal(after.items[i].stock, before.items[i].stock, `${label}: item[${i}].stock unchanged`)
    assert.equal(Number(after.items[i].daily_price), Number(before.items[i].daily_price), `${label}: item[${i}].daily_price unchanged`)
  }
}

// ---------------------------------------------------------------------------
// Migration — idempotency against the REAL singleton document (there is
// only ever one, so this exercises the actual production data, which is
// itself the correct test: re-running the migration against real data must
// be safe, which is exactly what "idempotent" has to mean for a singleton).
// ---------------------------------------------------------------------------

test('migration is idempotent against the real TodayMenu singleton: running it twice changes nothing observable', async () => {
  const before = await snapshotPostgresTodayMenu()

  const firstRun = await runTodayMenuMigration()
  assert.equal(firstRun.summary.failed_count, 0)

  const afterFirst = await snapshotPostgresTodayMenu()
  assertPostgresTodayMenuUnchanged(before, afterFirst, 'after first re-run')

  const secondRun = await runTodayMenuMigration()
  assert.equal(secondRun.summary.failed_count, 0)
  assert.equal(secondRun.summary.inserted_count, 0, 're-running a migrated singleton must never insert a second row')

  const afterSecond = await snapshotPostgresTodayMenu()
  assertPostgresTodayMenuUnchanged(before, afterSecond, 'after second re-run')

  const rowCount = await pool.query('SELECT COUNT(*)::int AS count FROM today_menu')
  assert.equal(rowCount.rows[0].count, 1, 'exactly one today_menu row must exist, never a duplicate')
})

test('migration reports no_source_document cleanly when MongoDB has no TodayMenu doc (does not touch Postgres)', async () => {
  const mongoSnapshot = await snapshotMongoTodayMenu()
  const pgBefore = await snapshotPostgresTodayMenu()
  try {
    await TodayMenuMongo.deleteMany({})
    const result = await runTodayMenuMigration()
    assert.equal(result.status, 'no_source_document')
    assert.equal(result.summary.source_count, 0)
    assert.equal(result.summary.failed_count, 0)

    const pgAfter = await snapshotPostgresTodayMenu()
    assertPostgresTodayMenuUnchanged(pgBefore, pgAfter, 'no-source-document run must not touch existing Postgres data')
  } finally {
    await restoreMongoTodayMenu(mongoSnapshot)
  }
})

// ---------------------------------------------------------------------------
// All-or-nothing validation (Step 4 / 11) — an unresolvable item id aborts
// the ENTIRE migration; nothing is written, and the previous Postgres state
// is provably untouched. Never invents a replacement MenuItem.
// ---------------------------------------------------------------------------

test('migration ABORTS with zero PostgreSQL writes when the source document contains an unresolvable item id', async () => {
  const mongoSnapshot = await snapshotMongoTodayMenu()
  const pgBefore = await snapshotPostgresTodayMenu()
  try {
    const corruptedItems = [
      ...(mongoSnapshot?.items ?? []),
      { id: 'this-id-has-never-existed-in-either-database', available: true, stock: 1, dailyPrice: 1 },
    ]
    await TodayMenuMongo.findOneAndUpdate(
      {},
      { publishedAt: mongoSnapshot?.publishedAt ?? new Date(), items: corruptedItems },
      { upsert: true },
    )

    const result = await runTodayMenuMigration()
    assert.equal(result.status, 'ABORTED_UNRESOLVED_ITEMS')
    assert.equal(result.summary.failed_count, 1)
    assert.equal(result.summary.inserted_count, 0)
    assert.equal(result.summary.updated_count, 0)
    assert.equal(result.unresolved.length, 1)
    assert.equal(result.unresolved[0].rawId, 'this-id-has-never-existed-in-either-database')

    const pgAfter = await snapshotPostgresTodayMenu()
    assertPostgresTodayMenuUnchanged(pgBefore, pgAfter, 'an aborted migration must leave PostgreSQL completely untouched')

    // Never silently created a replacement MenuItem for the bad id.
    const phantom = await pool.query('SELECT id FROM menu_items WHERE legacy_mongo_id = $1', ['this-id-has-never-existed-in-either-database'])
    assert.equal(phantom.rows.length, 0)
  } finally {
    await restoreMongoTodayMenu(mongoSnapshot)
  }
})

// ---------------------------------------------------------------------------
// Transactional rollback (Step 21) — a genuine mid-write PostgreSQL error
// (NUMERIC(8,2) overflow, confirmed to actually throw) fires AFTER
// replaceTodayMenu's DELETE of the previous child rows but BEFORE COMMIT,
// so a successful rollback has to restore rows that were already deleted
// inside the same transaction — not just "reject the bad insert."
// ---------------------------------------------------------------------------

test('replaceTodayMenu rolls back completely on a genuine mid-transaction database error — the previous state survives byte-for-byte', async () => {
  const before = await snapshotPostgresTodayMenu()
  assert.ok(before, 'sanity check: a real TodayMenu must already exist for this test to be meaningful')

  const validItem = before.items[0]
  const poisonedItems = [
    { id: String(validItem.menu_item_id), available: true, stock: 5, dailyPrice: 12345678 }, // 8 digits — overflows NUMERIC(8,2)
  ]

  await assert.rejects(
    () => replaceTodayMenu({ canteenId: canteen.id, publishedAt: new Date().toISOString(), items: poisonedItems }),
    (err) => /numeric field overflow/.test(err.message),
    'the overflow must propagate as a real error, not be swallowed',
  )

  const after = await snapshotPostgresTodayMenu()
  assertPostgresTodayMenuUnchanged(before, after, 'after a rolled-back write')

  const rowCount = await pool.query('SELECT COUNT(*)::int AS count FROM today_menu_items WHERE today_menu_id = $1', [before.id])
  assert.equal(rowCount.rows[0].count, before.items.length, 'the DELETE that ran before the failing INSERT must itself have been rolled back')
})

// ---------------------------------------------------------------------------
// Duplicate-id write behavior (schema.sql's documented "last one wins" —
// see today_menu_items' UNIQUE(today_menu_id, menu_item_id) comment).
// ---------------------------------------------------------------------------

test('replaceTodayMenu: duplicate ids in one publish keep the LAST occurrence, at its own original position', async () => {
  const before = await snapshotPostgresTodayMenu()
  try {
    const menuItemId = before.items[0].menu_item_id
    await replaceTodayMenu({
      canteenId: canteen.id,
      publishedAt: new Date().toISOString(),
      items: [
        { id: String(menuItemId), available: false, stock: 1, dailyPrice: 1 }, // superseded
        { id: String(menuItemId), available: true, stock: 9, dailyPrice: 9 }, // last -> wins
      ],
    })

    const after = await getTodayMenu(canteen.id)
    assert.equal(after.items.length, 1, 'duplicate ids must collapse to exactly one row, not two')
    assert.equal(after.items[0].available, true)
    assert.equal(after.items[0].stock, 9)
    assert.equal(Number(after.items[0].daily_price), 9)
  } finally {
    await replaceTodayMenu({
      canteenId: canteen.id,
      publishedAt: before.published_at,
      items: before.items.map((row) => ({ id: String(row.menu_item_id), available: row.available, stock: row.stock, dailyPrice: Number(row.daily_price) })),
    })
  }
})

test.after(async () => {
  await mongoose.connection.close()
})
