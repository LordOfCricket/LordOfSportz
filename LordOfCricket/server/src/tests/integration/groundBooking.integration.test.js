// Phase 14 Part 3 — ground booking, proved against real PostgreSQL. The
// concurrency test below is the actual acceptance criterion (Part 51): two
// genuinely simultaneous requests, not request A then request B.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pool } from '../../config/db.js'
import * as bookingService from '../../services/groundBooking.service.js'
import { BookingError } from '../../domain/booking/errors.js'
import { groundTodayDateStr, addDaysToDateStr, groundLocalToUtc } from '../../domain/booking/timezone.js'
import { generatePublicId } from '../../utils/publicId.js'
import * as matchService from '../../services/match.service.js'
import * as pricingService from '../../services/groundPricing.service.js'
import { findDefaultGround } from '../../models/ground.model.js'

const TEST_DATE = addDaysToDateStr(groundTodayDateStr(), 10)
const TEST_DATE_2 = addDaysToDateStr(groundTodayDateStr(), 11)
const TEST_DATE_3 = addDaysToDateStr(groundTodayDateStr(), 12)

// Ground Pricing UX Polish — this file's tests are about booking/concurrency/
// cancellation mechanics, not pricing itself, but a CUSTOMER booking now
// requires an active pricing slot covering its start time (PRICE_UNAVAILABLE
// otherwise). A single slot spanning the whole default operating window
// covers every hour this file books at (6/8/10/12/14/18) without needing to
// touch every individual test. Created once, removed once — never left
// behind for other files/suites that also use the default ground.
let fixturePricingSlot = null
test.before(async () => {
  const ground = await findDefaultGround()
  fixturePricingSlot = await pricingService.createPricingSlot(ground, { startTime: '00:00', endTime: '23:59', price: 1000 }, null)
})

async function makeUser(name) {
  const { rows } = await pool.query(
    `INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, 'not-a-real-hash', 'player') RETURNING *`,
    [name, `booking-test-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`]
  )
  return rows[0]
}

async function cleanupUsers(ids) {
  if (ids.length) await pool.query('DELETE FROM users WHERE id = ANY($1)', [ids])
}

async function cleanupBookingsOnDates(dates) {
  await pool.query(
    `DELETE FROM ground_bookings WHERE start_time >= $1 AND start_time < $2`,
    [groundLocalToUtc(dates[0], 0, 0), groundLocalToUtc(dates[dates.length - 1], 24, 0)]
  )
}

test('CONCURRENCY (non-negotiable, Part 51): two simultaneous booking requests for the exact same slot — exactly one succeeds', async () => {
  const userA = await makeUser('Concurrency A')
  const userB = await makeUser('Concurrency B')
  try {
    const attempt = (user) => bookingService.createBooking({ dateStr: TEST_DATE, hour: 18, minute: 0, userId: user.id, customerName: user.name })

    const [a, b] = await Promise.allSettled([attempt(userA), attempt(userB)])
    const results = [a, b]
    const fulfilled = results.filter((r) => r.status === 'fulfilled')
    const rejected = results.filter((r) => r.status === 'rejected')

    assert.equal(fulfilled.length, 1, 'exactly one request must succeed')
    assert.equal(rejected.length, 1, 'exactly one request must fail')
    assert.ok(rejected[0].reason instanceof BookingError, 'the loser must get a structured BookingError, not a raw DB error')
    assert.equal(rejected[0].reason.code, 'BOOKING_CONFLICT')
    assert.ok(Array.isArray(rejected[0].reason.details.alternatives), 'the conflict response must include alternatives')

    const { rows } = await pool.query(
      `SELECT * FROM ground_bookings WHERE status = 'CONFIRMED' AND start_time = $1`,
      [groundLocalToUtc(TEST_DATE, 18, 0)]
    )
    assert.equal(rows.length, 1, 'exactly one CONFIRMED booking exists in the database — never two')
  } finally {
    await cleanupBookingsOnDates([TEST_DATE])
    await cleanupUsers([userA.id, userB.id])
  }
})

test('OVERLAP (Part 52): the database exclusion constraint correctly rejects every overlapping shape and allows touching ranges', async () => {
  // Phase 24 — ground_id is NOT NULL; this direct-SQL test (deliberately
  // bypassing the service layer to exercise the raw constraint) needs the
  // same ground every other booking in this suite implicitly uses.
  const { rows: [{ id: groundId }] } = await pool.query('SELECT id FROM grounds ORDER BY id ASC LIMIT 1')
  const insert = (ref, startHour, startMin, endHour, endMin) =>
    pool.query(
      `INSERT INTO ground_bookings (ground_id, public_booking_id, customer_name, start_time, end_time) VALUES ($1,$2,'t',$3,$4)`,
      [groundId, ref, groundLocalToUtc(TEST_DATE_2, startHour, startMin), groundLocalToUtc(TEST_DATE_2, endHour, endMin)]
    )
  const tryInsert = async (...args) => {
    try {
      await insert(...args)
      return 'ALLOWED'
    } catch (err) {
      return err.code === '23P01' ? 'REJECTED' : `ERROR:${err.code}`
    }
  }

  try {
    await insert(generatePublicId('OVT'), 18, 0, 20, 0) // existing 6-8pm

    assert.equal(await tryInsert(generatePublicId('OVT'), 18, 0, 20, 0), 'REJECTED', 'identical range')
    assert.equal(await tryInsert(generatePublicId('OVT'), 19, 0, 21, 0), 'REJECTED', '7-9 overlaps 6-8')
    assert.equal(await tryInsert(generatePublicId('OVT'), 17, 0, 19, 0), 'REJECTED', '5-7 overlaps 6-8')
    assert.equal(await tryInsert(generatePublicId('OVT'), 17, 0, 21, 0), 'REJECTED', '5-9 engulfs 6-8')
    assert.equal(await tryInsert(generatePublicId('OVT'), 18, 30, 19, 0), 'REJECTED', '6:30-7 is inside 6-8')
    assert.equal(await tryInsert(generatePublicId('OVT'), 20, 0, 22, 0), 'ALLOWED', '8-10 only touches 6-8, no overlap')
    assert.equal(await tryInsert(generatePublicId('OVT'), 16, 0, 18, 0), 'ALLOWED', '4-6 only touches 6-8, no overlap')
  } finally {
    await cleanupBookingsOnDates([TEST_DATE_2])
  }
})

test('STAFF BLOCK (Part 53): a staff block occupies the slot for customer bookings, and recommendations exclude it', async () => {
  const staffUser = await makeUser('Block Staff')
  try {
    await bookingService.createStaffBlock({ dateStr: TEST_DATE_3, hour: 18, minute: 0, purpose: 'Maintenance', createdByStaffId: staffUser.id })

    await assert.rejects(
      () => bookingService.createBooking({ dateStr: TEST_DATE_3, hour: 18, minute: 0, customerName: 'Blocked Attempt' }),
      (err) => err instanceof BookingError && err.code === 'BOOKING_CONFLICT'
    )

    const availability = await bookingService.getDayAvailability(TEST_DATE_3, { isStaff: true })
    const sixPm = availability.find((s) => new Date(s.startTime).getTime() === groundLocalToUtc(TEST_DATE_3, 18, 0).getTime())
    assert.equal(sixPm.status, 'UNAVAILABLE')
    assert.equal(sixPm.reason, 'BLOCKED')

    // Remove the block — the slot must become bookable again.
    const { rows } = await pool.query(`SELECT public_booking_id FROM ground_bookings WHERE booking_type = 'STAFF_BLOCK' AND start_time = $1`, [groundLocalToUtc(TEST_DATE_3, 18, 0)])
    await bookingService.cancelBooking(rows[0].public_booking_id, { actingUserId: staffUser.id, isStaff: true })

    const { booking } = await bookingService.createBooking({ dateStr: TEST_DATE_3, hour: 18, minute: 0, customerName: 'After Block Removed' })
    assert.equal(booking.status, 'CONFIRMED')
  } finally {
    await cleanupBookingsOnDates([TEST_DATE_3])
    await cleanupUsers([staffUser.id])
  }
})

test('CANCELLATION: owner can cancel, slot becomes available again; a stranger cannot', async () => {
  const owner = await makeUser('Booking Owner')
  const stranger = await makeUser('Not The Owner')
  try {
    const { booking } = await bookingService.createBooking({ dateStr: TEST_DATE, hour: 8, minute: 0, userId: owner.id, customerName: owner.name })

    await assert.rejects(
      () => bookingService.cancelBooking(booking.public_booking_id, { actingUserId: stranger.id, isStaff: false }),
      (err) => err instanceof BookingError && err.code === 'FORBIDDEN'
    )

    const cancelled = await bookingService.cancelBooking(booking.public_booking_id, { actingUserId: owner.id, isStaff: false })
    assert.equal(cancelled.status, 'CANCELLED')

    // Slot must be rebookable now that the cancelled row is excluded from the constraint.
    const { booking: rebooked } = await bookingService.createBooking({ dateStr: TEST_DATE, hour: 8, minute: 0, customerName: 'Rebooked' })
    assert.equal(rebooked.status, 'CONFIRMED')
  } finally {
    await cleanupBookingsOnDates([TEST_DATE])
    await cleanupUsers([owner.id, stranger.id])
  }
})

test('CANCELLATION: cancelling an already-cancelled booking is rejected, not a silent success', async () => {
  const owner = await makeUser('Double Cancel Owner')
  try {
    const { booking } = await bookingService.createBooking({ dateStr: TEST_DATE, hour: 10, minute: 0, userId: owner.id, customerName: owner.name })
    await bookingService.cancelBooking(booking.public_booking_id, { actingUserId: owner.id, isStaff: false })
    await assert.rejects(
      () => bookingService.cancelBooking(booking.public_booking_id, { actingUserId: owner.id, isStaff: false }),
      (err) => err instanceof BookingError && err.code === 'ALREADY_CANCELLED'
    )
  } finally {
    await cleanupBookingsOnDates([TEST_DATE])
    await cleanupUsers([owner.id])
  }
})

test('MY BOOKINGS (Priority 4): listMyBookings carries the ground identity each booking was made at', async () => {
  const user = await makeUser('My Bookings Ground User')
  try {
    const ground = await findDefaultGround()
    await bookingService.createBooking({ dateStr: TEST_DATE_2, hour: 14, minute: 0, userId: user.id, customerName: user.name })

    const rows = await bookingService.listMyBookings(user.id)
    assert.equal(rows.length, 1)
    // The repo now LEFT JOINs grounds; the serializer turns these aliased
    // columns into a public-safe { publicGroundId, name, city } block.
    assert.equal(rows[0].ground_public_id, ground.public_ground_id)
    assert.equal(rows[0].ground_name, ground.name)
    assert.ok(!('email' in rows[0]) || rows[0].email == null) // no ground-owner private data leaked in
  } finally {
    await cleanupBookingsOnDates([TEST_DATE_2])
    await cleanupUsers([user.id])
  }
})

test('IDEMPOTENCY: retrying the same clientActionId returns the original booking, never a duplicate', async () => {
  const user = await makeUser('Idempotency User')
  const clientActionId = '11111111-1111-4111-8111-111111111111'
  try {
    const first = await bookingService.createBooking({ dateStr: TEST_DATE, hour: 12, minute: 0, userId: user.id, customerName: user.name, clientActionId })
    const second = await bookingService.createBooking({ dateStr: TEST_DATE, hour: 12, minute: 0, userId: user.id, customerName: user.name, clientActionId })

    assert.equal(second.idempotentReplay, true)
    assert.equal(second.booking.public_booking_id, first.booking.public_booking_id)

    const count = await pool.query(`SELECT COUNT(*) FROM ground_bookings WHERE client_action_id = $1`, [clientActionId])
    assert.equal(Number(count.rows[0].count), 1)
  } finally {
    await cleanupBookingsOnDates([TEST_DATE])
    await cleanupUsers([user.id])
  }
})

test('MATCH OCCUPANCY (Part 37/54): a scheduled LOC match blocks the whole day for customer bookings', async () => {
  const teamRows = await pool.query(`SELECT id FROM teams LIMIT 2`)
  if (teamRows.rows.length < 2) return // no seeded teams in this environment — nothing to assert
  const [teamA, teamB] = teamRows.rows

  const match = await matchService.createMatch({
    teamAId: teamA.id,
    teamBId: teamB.id,
    venue: 'Booking Occupancy Test',
    matchDate: `${TEST_DATE_2}T18:00:00`,
    oversPerInnings: 20,
    ballsPerOver: 6,
  })

  try {
    const availability = await bookingService.getDayAvailability(TEST_DATE_2, { isStaff: true })
    assert.ok(availability.every((s) => s.status === 'UNAVAILABLE' && s.reason === 'MATCH'), 'every slot on a match day must be blocked')

    await assert.rejects(
      () => bookingService.createBooking({ dateStr: TEST_DATE_2, hour: 10, minute: 0, customerName: 'Match Day Attempt' }),
      (err) => err instanceof BookingError && err.code === 'BOOKING_CONFLICT'
    )
  } finally {
    await pool.query('DELETE FROM matches WHERE id = $1', [match.id])
    await cleanupBookingsOnDates([TEST_DATE_2])
  }
})

test('ALTERNATIVES: an occupied slot returns bounded, genuinely-available recommendations', async () => {
  try {
    await bookingService.createBooking({ dateStr: TEST_DATE_3, hour: 14, minute: 0, customerName: 'Occupant' })
    await assert.rejects(
      () => bookingService.createBooking({ dateStr: TEST_DATE_3, hour: 14, minute: 0, customerName: 'Conflict Attempt' }),
      (err) => {
        assert.ok(err instanceof BookingError)
        assert.ok(err.details.alternatives.length > 0)
        assert.ok(err.details.alternatives.length <= 5)
        return true
      }
    )
  } finally {
    await cleanupBookingsOnDates([TEST_DATE_3])
  }
})

test('PRIVACY: staff schedule and public availability responses shape', async () => {
  const user = await makeUser('Privacy Test User')
  try {
    await bookingService.createBooking({ dateStr: TEST_DATE, hour: 6, minute: 0, userId: user.id, customerName: user.name, contactPhone: '9999999999' })

    const publicSlots = await bookingService.getDayAvailability(TEST_DATE, { isStaff: false })
    // Public availability must never carry a reason/contact-shaped detail.
    assert.ok(publicSlots.every((s) => s.reason === null))
    assert.ok(publicSlots.every((s) => !('contactPhone' in s) && !('customerName' in s)))
  } finally {
    await cleanupBookingsOnDates([TEST_DATE])
    await cleanupUsers([user.id])
  }
})

test.after(async () => {
  await cleanupBookingsOnDates([TEST_DATE])
  await cleanupBookingsOnDates([TEST_DATE_2])
  await cleanupBookingsOnDates([TEST_DATE_3])
  if (fixturePricingSlot) {
    const ground = await findDefaultGround()
    await pricingService.deletePricingSlot(ground, fixturePricingSlot.id, null)
  }
})
