// Phase 24 — the multi-ground/team/player conflict engine, proved against
// real PostgreSQL, same convention as groundBooking.integration.test.js
// (Phase 14's own "the concurrency test is the actual acceptance
// criterion" philosophy). Exercises bookingConflict.service.js directly
// (not HTTP) for the same reason the walk-in flow's own concurrency test
// does: the transaction/EXCLUDE-constraint behavior being proved lives in
// the service+repository+DB, not in Express routing.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pool } from '../../config/db.js'
import { createPlayer } from '../../models/player.model.js'
import { generatePublicId } from '../../utils/publicId.js'
import * as engine from '../../services/bookingConflict.service.js'
import { BookingError } from '../../domain/booking/errors.js'
import { groundTodayDateStr, addDaysToDateStr, groundLocalToUtc } from '../../domain/shared/groundTime.js'

const DAY = addDaysToDateStr(groundTodayDateStr(), 15)

async function makeGround(overrides = {}) {
  const { rows } = await pool.query(
    `INSERT INTO grounds (public_ground_id, slug, name, status, opening_hour, closing_hour) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [
      generatePublicId('GRD'),
      `team-booking-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      overrides.name || 'Team Booking Test Ground',
      overrides.status || 'ACTIVE',
      overrides.openingHour ?? null,
      overrides.closingHour ?? null,
    ]
  )
  return rows[0]
}

async function makeTeam(name) {
  const { rows } = await pool.query(`INSERT INTO teams (name, short_name) VALUES ($1,$2) RETURNING *`, [name, name.slice(0, 10)])
  return rows[0]
}

async function makeUserWithPlayer(name, teamId) {
  const { rows: userRows } = await pool.query(
    `INSERT INTO users (name, email, password_hash, role) VALUES ($1,$2,'not-a-real-hash','player') RETURNING *`,
    [name, `team-booking-test-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`]
  )
  const user = userRows[0]
  const player = await createPlayer({ name, teamId, role: 'BATSMAN', userId: user.id })
  return { user, player }
}

async function cleanup({ groundIds = [], teamIds = [], playerIds = [], userIds = [] }) {
  if (groundIds.length) await pool.query('DELETE FROM ground_bookings WHERE ground_id = ANY($1)', [groundIds])
  if (playerIds.length) await pool.query('DELETE FROM players WHERE id = ANY($1)', [playerIds])
  if (teamIds.length) await pool.query('DELETE FROM teams WHERE id = ANY($1)', [teamIds])
  if (userIds.length) await pool.query('DELETE FROM users WHERE id = ANY($1)', [userIds])
  if (groundIds.length) await pool.query('DELETE FROM grounds WHERE id = ANY($1)', [groundIds])
}

test('GROUND CONFLICT: two different teams cannot book the same ground for overlapping times, even for different purposes', async () => {
  const ground = await makeGround()
  const teamA = await makeTeam('GC Team A')
  const teamB = await makeTeam('GC Team B')
  const { user: userA, player: playerA } = await makeUserWithPlayer('GC Player A', teamA.id)
  const { user: userB, player: playerB } = await makeUserWithPlayer('GC Player B', teamB.id)
  try {
    const { booking: first } = await engine.createTeamBooking({
      ground, actingUserId: userA.id, bookingPurpose: 'PRACTICE',
      startTime: groundLocalToUtc(DAY, 18, 0), endTime: groundLocalToUtc(DAY, 20, 0),
      teamId: teamA.id, participantPlayerIds: [playerA.id],
    })
    assert.equal(first.status, 'CONFIRMED')

    await assert.rejects(
      () => engine.createTeamBooking({
        ground, actingUserId: userB.id, bookingPurpose: 'PRACTICE',
        startTime: groundLocalToUtc(DAY, 19, 0), endTime: groundLocalToUtc(DAY, 21, 0),
        teamId: teamB.id, participantPlayerIds: [playerB.id],
      }),
      (err) => err instanceof BookingError && err.code === 'GROUND_SLOT_UNAVAILABLE'
    )

    // Adjacent (touching, not overlapping) is allowed — [)  semantics.
    const { booking: adjacent } = await engine.createTeamBooking({
      ground, actingUserId: userB.id, bookingPurpose: 'PRACTICE',
      startTime: groundLocalToUtc(DAY, 20, 0), endTime: groundLocalToUtc(DAY, 22, 0),
      teamId: teamB.id, participantPlayerIds: [playerB.id],
    })
    assert.equal(adjacent.status, 'CONFIRMED')
  } finally {
    await cleanup({ groundIds: [ground.id], teamIds: [teamA.id, teamB.id], playerIds: [playerA.id, playerB.id], userIds: [userA.id, userB.id] })
  }
})

test('TEAM CONFLICT: the same team cannot have overlapping bookings even at two DIFFERENT grounds', async () => {
  const groundX = await makeGround({ name: 'Ground X' })
  const groundY = await makeGround({ name: 'Ground Y' })
  const team = await makeTeam('TC Team')
  const { user, player } = await makeUserWithPlayer('TC Player', team.id)
  try {
    await engine.createTeamBooking({
      ground: groundX, actingUserId: user.id, bookingPurpose: 'PRACTICE',
      startTime: groundLocalToUtc(DAY, 18, 0), endTime: groundLocalToUtc(DAY, 20, 0),
      teamId: team.id, participantPlayerIds: [player.id],
    })

    await assert.rejects(
      () => engine.createTeamBooking({
        ground: groundY, actingUserId: user.id, bookingPurpose: 'PRACTICE',
        startTime: groundLocalToUtc(DAY, 19, 0), endTime: groundLocalToUtc(DAY, 21, 0),
        teamId: team.id, participantPlayerIds: [player.id],
      }),
      (err) => err instanceof BookingError && err.code === 'TEAM_TIME_CONFLICT'
    )
  } finally {
    await cleanup({ groundIds: [groundX.id, groundY.id], teamIds: [team.id], playerIds: [player.id], userIds: [user.id] })
  }
})

test('PLAYER CONFLICT: the same player cannot participate in two overlapping bookings, even under different teams/grounds/creators', async () => {
  const groundX = await makeGround({ name: 'Ground PX' })
  const groundY = await makeGround({ name: 'Ground PY' })
  const teamA = await makeTeam('PC Team A')
  const teamB = await makeTeam('PC Team B')
  const { user: rahulUser, player: rahul } = await makeUserWithPlayer('Rahul PC', teamA.id)
  const { user: otherUser, player: otherPlayer } = await makeUserWithPlayer('Other PC', teamB.id)
  try {
    await engine.createTeamBooking({
      ground: groundX, actingUserId: rahulUser.id, bookingPurpose: 'PRACTICE',
      startTime: groundLocalToUtc(DAY, 18, 0), endTime: groundLocalToUtc(DAY, 20, 0),
      teamId: teamA.id, participantPlayerIds: [rahul.id],
    })

    // Team B, different ground, different creator — but Rahul is also listed. Must reject.
    await assert.rejects(
      () => engine.createTeamBooking({
        ground: groundY, actingUserId: otherUser.id, bookingPurpose: 'PRACTICE',
        startTime: groundLocalToUtc(DAY, 19, 0), endTime: groundLocalToUtc(DAY, 21, 0),
        teamId: teamB.id, participantPlayerIds: [otherPlayer.id, rahul.id],
      }),
      (err) => err instanceof BookingError && err.code === 'PLAYER_TIME_CONFLICT' && err.details.playerId === rahul.id
    )

    // Same player, non-overlapping time (8-10pm after 6-8pm) — allowed.
    const { booking: allowed } = await engine.createTeamBooking({
      ground: groundY, actingUserId: otherUser.id, bookingPurpose: 'PRACTICE',
      startTime: groundLocalToUtc(DAY, 20, 0), endTime: groundLocalToUtc(DAY, 22, 0),
      teamId: teamB.id, participantPlayerIds: [otherPlayer.id, rahul.id],
    })
    assert.equal(allowed.status, 'CONFIRMED')
  } finally {
    await cleanup({ groundIds: [groundX.id, groundY.id], teamIds: [teamA.id, teamB.id], playerIds: [rahul.id, otherPlayer.id], userIds: [rahulUser.id, otherUser.id] })
  }
})

test('CONCURRENCY (non-negotiable): two simultaneous bookings for the same player at overlapping times — exactly one succeeds', async () => {
  const groundX = await makeGround({ name: 'Concurrency Ground X' })
  const groundY = await makeGround({ name: 'Concurrency Ground Y' })
  const teamA = await makeTeam('Conc Team A')
  const teamB = await makeTeam('Conc Team B')
  const { user: userA, player: playerA } = await makeUserWithPlayer('Conc Player A', teamA.id)
  const { user: userB, player: sharedPlayer } = await makeUserWithPlayer('Conc Shared Player', teamB.id)
  try {
    const attempt = (ground, actingUserId, teamId, playerIds) =>
      engine.createTeamBooking({
        ground, actingUserId, bookingPurpose: 'PRACTICE',
        startTime: groundLocalToUtc(DAY, 6, 0), endTime: groundLocalToUtc(DAY, 8, 0),
        teamId, participantPlayerIds: playerIds,
      }).then(() => 'ALLOWED').catch((err) => (err instanceof BookingError ? err.code : 'ERROR'))

    const results = await Promise.all([
      attempt(groundX, userA.id, teamA.id, [playerA.id, sharedPlayer.id]),
      attempt(groundY, userB.id, teamB.id, [sharedPlayer.id]),
    ])
    const allowedCount = results.filter((r) => r === 'ALLOWED').length
    const conflictCount = results.filter((r) => r === 'PLAYER_TIME_CONFLICT').length
    assert.equal(allowedCount, 1, `exactly one booking should succeed, got: ${JSON.stringify(results)}`)
    assert.equal(conflictCount, 1, `the loser should get PLAYER_TIME_CONFLICT, got: ${JSON.stringify(results)}`)

    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS n FROM booking_player_slots WHERE player_id = $1 AND time_range && tstzrange($2,$3,'[)')`,
      [sharedPlayer.id, groundLocalToUtc(DAY, 6, 0), groundLocalToUtc(DAY, 8, 0)]
    )
    assert.equal(rows[0].n, 1, 'never two live slot rows for the same player at overlapping times')
  } finally {
    await cleanup({ groundIds: [groundX.id, groundY.id], teamIds: [teamA.id, teamB.id], playerIds: [playerA.id, sharedPlayer.id], userIds: [userA.id, userB.id] })
  }
})

test('CANCELLATION releases the ground/team/player slots — a new booking for the exact same time/team/players is then allowed', async () => {
  const ground = await makeGround()
  const team = await makeTeam('Release Team')
  const { user, player } = await makeUserWithPlayer('Release Player', team.id)
  try {
    const { booking } = await engine.createTeamBooking({
      ground, actingUserId: user.id, bookingPurpose: 'PRACTICE',
      startTime: groundLocalToUtc(DAY, 8, 0), endTime: groundLocalToUtc(DAY, 10, 0),
      teamId: team.id, participantPlayerIds: [player.id],
    })

    const cancelled = await engine.cancelTeamBooking(booking.public_booking_id, { actingUserId: user.id })
    assert.equal(cancelled.status, 'CANCELLED')

    const { rows: slotRows } = await pool.query('SELECT * FROM booking_team_slots WHERE booking_id = $1', [booking.id])
    assert.equal(slotRows.length, 0, 'team slot must be released on cancellation')
    const { rows: participantRows } = await pool.query('SELECT * FROM booking_participants WHERE booking_id = $1', [booking.id])
    assert.equal(participantRows.length, 1, 'the historical participant snapshot must survive cancellation, never deleted')

    const { booking: rebooked } = await engine.createTeamBooking({
      ground, actingUserId: user.id, bookingPurpose: 'PRACTICE',
      startTime: groundLocalToUtc(DAY, 8, 0), endTime: groundLocalToUtc(DAY, 10, 0),
      teamId: team.id, participantPlayerIds: [player.id],
    })
    assert.equal(rebooked.status, 'CONFIRMED')
  } finally {
    await cleanup({ groundIds: [ground.id], teamIds: [team.id], playerIds: [player.id], userIds: [user.id] })
  }
})

test('AUTHORIZATION: a player not on the team cannot create a booking on its behalf, and a stranger cannot cancel someone else\'s booking', async () => {
  const ground = await makeGround()
  const team = await makeTeam('Auth Team')
  const { user: owner, player: ownerPlayer } = await makeUserWithPlayer('Auth Owner', team.id)
  const outsiderTeam = await makeTeam('Auth Outsider Team')
  const { user: outsider, player: outsiderPlayer } = await makeUserWithPlayer('Auth Outsider', outsiderTeam.id)
  try {
    await assert.rejects(
      () => engine.createTeamBooking({
        ground, actingUserId: outsider.id, bookingPurpose: 'MATCH',
        startTime: groundLocalToUtc(DAY, 10, 0), endTime: groundLocalToUtc(DAY, 12, 0),
        teamId: team.id, participantPlayerIds: [ownerPlayer.id],
      }),
      (err) => err instanceof BookingError && err.code === 'UNAUTHORIZED_TEAM_ACTION'
    )

    const { booking } = await engine.createTeamBooking({
      ground, actingUserId: owner.id, bookingPurpose: 'PRACTICE',
      startTime: groundLocalToUtc(DAY, 10, 0), endTime: groundLocalToUtc(DAY, 12, 0),
      teamId: team.id, participantPlayerIds: [ownerPlayer.id],
    })

    await assert.rejects(
      () => engine.cancelTeamBooking(booking.public_booking_id, { actingUserId: outsider.id }),
      (err) => err instanceof BookingError && err.code === 'FORBIDDEN'
    )
  } finally {
    await cleanup({ groundIds: [ground.id], teamIds: [team.id, outsiderTeam.id], playerIds: [ownerPlayer.id, outsiderPlayer.id], userIds: [owner.id, outsider.id] })
  }
})

test('INPUT VALIDATION: duplicate participant ids, an unknown player id, and end<=start are all rejected before touching the database', async () => {
  const ground = await makeGround()
  const team = await makeTeam('Validation Team')
  const { user, player } = await makeUserWithPlayer('Validation Player', team.id)
  try {
    await assert.rejects(
      () => engine.createTeamBooking({
        ground, actingUserId: user.id, bookingPurpose: 'PRACTICE',
        startTime: groundLocalToUtc(DAY, 10, 0), endTime: groundLocalToUtc(DAY, 12, 0),
        teamId: team.id, participantPlayerIds: [player.id, player.id],
      }),
      (err) => err instanceof BookingError && err.code === 'DUPLICATE_PARTICIPANT'
    )

    await assert.rejects(
      () => engine.createTeamBooking({
        ground, actingUserId: user.id, bookingPurpose: 'PRACTICE',
        startTime: groundLocalToUtc(DAY, 10, 0), endTime: groundLocalToUtc(DAY, 12, 0),
        teamId: team.id, participantPlayerIds: [999999999],
      }),
      (err) => err instanceof BookingError && err.code === 'PLAYER_NOT_FOUND'
    )

    await assert.rejects(
      () => engine.createTeamBooking({
        ground, actingUserId: user.id, bookingPurpose: 'PRACTICE',
        startTime: groundLocalToUtc(DAY, 12, 0), endTime: groundLocalToUtc(DAY, 10, 0),
        teamId: team.id, participantPlayerIds: [player.id],
      }),
      (err) => err instanceof BookingError && err.code === 'INVALID_SLOT'
    )
  } finally {
    await cleanup({ groundIds: [ground.id], teamIds: [team.id], playerIds: [player.id], userIds: [user.id] })
  }
})

test('A MATCH booking requires a team; a SUSPENDED ground rejects every booking with GROUND_CLOSED', async () => {
  const activeGround = await makeGround()
  const suspendedGround = await makeGround({ status: 'SUSPENDED' })
  const team = await makeTeam('Purpose Team')
  const { user, player } = await makeUserWithPlayer('Purpose Player', team.id)
  try {
    await assert.rejects(
      () => engine.createTeamBooking({
        ground: activeGround, actingUserId: user.id, bookingPurpose: 'MATCH',
        startTime: groundLocalToUtc(DAY, 10, 0), endTime: groundLocalToUtc(DAY, 12, 0),
        teamId: null, participantPlayerIds: [player.id],
      }),
      (err) => err instanceof BookingError && err.code === 'INVALID_SLOT'
    )

    // PRACTICE with no team at all (individual/friends play) is allowed.
    const { booking } = await engine.createTeamBooking({
      ground: activeGround, actingUserId: user.id, bookingPurpose: 'PRACTICE',
      startTime: groundLocalToUtc(DAY, 10, 0), endTime: groundLocalToUtc(DAY, 12, 0),
      teamId: null, participantPlayerIds: [player.id],
    })
    assert.equal(booking.status, 'CONFIRMED')

    await assert.rejects(
      () => engine.createTeamBooking({
        ground: suspendedGround, actingUserId: user.id, bookingPurpose: 'PRACTICE',
        startTime: groundLocalToUtc(DAY, 10, 0), endTime: groundLocalToUtc(DAY, 12, 0),
        teamId: null, participantPlayerIds: [player.id],
      }),
      (err) => err instanceof BookingError && err.code === 'GROUND_CLOSED'
    )
  } finally {
    await cleanup({ groundIds: [activeGround.id, suspendedGround.id], teamIds: [team.id], playerIds: [player.id], userIds: [user.id] })
  }
})

test('CHECK-IN / NO-SHOW: check-in is idempotent-guarded, and a no-show transition releases the slot like any other terminal status', async () => {
  const ground = await makeGround()
  const team = await makeTeam('NoShow Team')
  const { user, player } = await makeUserWithPlayer('NoShow Player', team.id)
  try {
    const { booking } = await engine.createTeamBooking({
      ground, actingUserId: user.id, bookingPurpose: 'PRACTICE',
      startTime: groundLocalToUtc(DAY, 14, 0), endTime: groundLocalToUtc(DAY, 16, 0),
      teamId: team.id, participantPlayerIds: [player.id],
    })

    const checkedIn = await engine.checkInBooking(booking.public_booking_id, { actingStaffId: user.id, groundId: ground.id })
    assert.ok(checkedIn.checked_in_at)

    await assert.rejects(
      () => engine.checkInBooking(booking.public_booking_id, { actingStaffId: user.id, groundId: ground.id }),
      (err) => err instanceof BookingError && err.code === 'ALREADY_CHECKED_IN'
    )

    const noShow = await engine.recordNoShow(booking.public_booking_id, { actingStaffId: user.id, groundId: ground.id })
    assert.equal(noShow.status, 'NO_SHOW')

    const { rows: slotRows } = await pool.query('SELECT * FROM booking_player_slots WHERE booking_id = $1', [booking.id])
    assert.equal(slotRows.length, 0, 'NO_SHOW must release the player slot like any other non-blocking status')

    await assert.rejects(
      () => engine.recordNoShow(booking.public_booking_id, { actingStaffId: user.id, groundId: ground.id }),
      (err) => err instanceof BookingError && err.code === 'NOT_CONFIRMED'
    )
  } finally {
    await cleanup({ groundIds: [ground.id], teamIds: [team.id], playerIds: [player.id], userIds: [user.id] })
  }
})

test('TENANCY: staff actions scoped to one ground cannot reach a booking that belongs to a different ground', async () => {
  const groundA = await makeGround({ name: 'Tenancy Ground A' })
  const groundB = await makeGround({ name: 'Tenancy Ground B' })
  const team = await makeTeam('Tenancy Team')
  const { user, player } = await makeUserWithPlayer('Tenancy Player', team.id)
  try {
    const { booking } = await engine.createTeamBooking({
      ground: groundA, actingUserId: user.id, bookingPurpose: 'PRACTICE',
      startTime: groundLocalToUtc(DAY, 10, 0), endTime: groundLocalToUtc(DAY, 12, 0),
      teamId: team.id, participantPlayerIds: [player.id],
    })

    await assert.rejects(
      () => engine.checkInBooking(booking.public_booking_id, { actingStaffId: user.id, groundId: groundB.id }),
      (err) => err instanceof BookingError && err.code === 'BOOKING_NOT_FOUND'
    )
    await assert.rejects(
      () => engine.cancelTeamBooking(booking.public_booking_id, { actingUserId: user.id, isStaff: true, groundId: groundB.id }),
      (err) => err instanceof BookingError && err.code === 'BOOKING_NOT_FOUND'
    )
  } finally {
    await cleanup({ groundIds: [groundA.id, groundB.id], teamIds: [team.id], playerIds: [player.id], userIds: [user.id] })
  }
})

test('WALK-IN isolation: a MATCH/PRACTICE booking never appears as a WALK_IN row, and the engine never touches a WALK_IN booking', async () => {
  const ground = await makeGround()
  const team = await makeTeam('WalkIn Isolation Team')
  const { user, player } = await makeUserWithPlayer('WalkIn Isolation Player', team.id)
  try {
    const { rows } = await pool.query(
      `INSERT INTO ground_bookings (ground_id, public_booking_id, customer_name, start_time, end_time) VALUES ($1,$2,'Walk In Customer',$3,$4) RETURNING *`,
      [ground.id, generatePublicId('LOC', 6), groundLocalToUtc(DAY, 6, 0), groundLocalToUtc(DAY, 8, 0)]
    )
    const walkIn = rows[0]
    assert.equal(walkIn.booking_purpose, 'WALK_IN')

    await assert.rejects(
      () => engine.cancelTeamBooking(walkIn.public_booking_id, { actingUserId: user.id }),
      (err) => err instanceof BookingError && err.code === 'BOOKING_NOT_FOUND'
    )
  } finally {
    await cleanup({ groundIds: [ground.id], teamIds: [team.id], playerIds: [player.id], userIds: [user.id] })
  }
})
