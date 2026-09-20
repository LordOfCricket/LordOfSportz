import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pool } from '../config/db.js'
import * as engine from '../services/bookingConflict.service.js'
import * as proposalService from '../services/matchProposal.service.js'
import { BookingError, BOOKING_ERROR_CODES } from '../domain/booking/errors.js'

const db = pool

// Setup: create test data structures
async function setupTestGround() {
  const result = await db.query(
    `INSERT INTO grounds (name, city, public_ground_id, status)
     VALUES ($1, $2, $3, $4)
     RETURNING id, name, status, public_ground_id`,
    ['Test Ground Phase F', 'Test City', 'GRD-PHASEF', 'ACTIVE']
  )
  return result.rows[0]
}

async function setupTestTeam() {
  const result = await db.query(
    `INSERT INTO teams (name, short_name)
     VALUES ($1, $2)
     RETURNING id, name`,
    ['Phase F Team', 'PFT']
  )
  return result.rows[0]
}

async function setupTestUser() {
  const result = await db.query(
    `INSERT INTO users (name, email, password_hash, role)
     VALUES ($1, $2, $3, $4)
     RETURNING id, email`,
    [`Phase F User ${Date.now()}`, `phasef${Date.now()}@loc.test`, 'hash', 'player']
  )
  return result.rows[0]
}

async function setupTestPlayer(userId, teamId) {
  const result = await db.query(
    `INSERT INTO players (user_id, team_id, name, role)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [userId, teamId, `Player ${userId}`, 'BATSMAN']
  )
  return result.rows[0]
}

async function cleanupTest() {
  // Clean up in reverse order of dependencies
  await db.query(`DELETE FROM ground_notifications`)
  await db.query(`DELETE FROM ground_audit_log`)
  await db.query(`DELETE FROM booking_participants`)
  await db.query(`DELETE FROM booking_player_slots`)
  await db.query(`DELETE FROM booking_team_slots`)
  await db.query(`DELETE FROM booking_teams`)
  await db.query(`DELETE FROM match_proposals`)
  await db.query(`DELETE FROM ground_bookings`)
  await db.query(`DELETE FROM grounds WHERE name LIKE 'Test Ground%'`)
  await db.query(`DELETE FROM teams WHERE name LIKE 'Phase F%'`)
  await db.query(`DELETE FROM players WHERE name LIKE 'Player%'`)
  await db.query(`DELETE FROM users WHERE email LIKE '%phasef%'`)
}

// ============================================================================
// TEST: Ground Conflict Invariant
// ============================================================================

test('Ground Invariant: Exact same slot rejects second booking', async () => {
  await cleanupTest()
  const ground = await setupTestGround()
  const team1 = await setupTestTeam()
  const user1 = await setupTestUser()
  const player1 = await setupTestPlayer(user1.id, team1.id)

  const startTime = new Date(Date.now() + 86400000)
  const endTime = new Date(startTime.getTime() + 7200000)

  // First booking should succeed
  const b1 = await engine.createTeamBooking({
    ground,
    actingUserId: user1.id,
    bookingPurpose: 'MATCH',
    startTime,
    endTime,
    teamId: team1.id,
    participantPlayerIds: [player1.id],
  })
  assert.equal(b1.booking.status, 'CONFIRMED')

  // Second booking at exact same time should fail
  const user2 = await setupTestUser()
  const team2 = await setupTestTeam()
  const player2 = await setupTestPlayer(user2.id, team2.id)

  let error = null
  try {
    await engine.createTeamBooking({
      ground,
      actingUserId: user2.id,
      bookingPurpose: 'MATCH',
      startTime,
      endTime,
      teamId: team2.id,
      participantPlayerIds: [player2.id],
    })
  } catch (e) {
    error = e
  }

  assert.ok(error, 'Second booking should fail')
  assert.equal(error.code, BOOKING_ERROR_CODES.GROUND_SLOT_UNAVAILABLE)
})

test('Ground Invariant: Overlapping bookings rejected', async () => {
  await cleanupTest()
  const ground = await setupTestGround()
  const team1 = await setupTestTeam()
  const user1 = await setupTestUser()
  const player1 = await setupTestPlayer(user1.id, team1.id)

  const start1 = new Date(Date.now() + 86400000)
  const end1 = new Date(start1.getTime() + 7200000)

  // First booking: 6-8
  await engine.createTeamBooking({
    ground,
    actingUserId: user1.id,
    bookingPurpose: 'MATCH',
    startTime: start1,
    endTime: end1,
    teamId: team1.id,
    participantPlayerIds: [player1.id],
  })

  // Attempt overlapping: 7-9 (conflicts)
  const user2 = await setupTestUser()
  const team2 = await setupTestTeam()
  const player2 = await setupTestPlayer(user2.id, team2.id)

  const start2 = new Date(start1.getTime() + 3600000)
  const end2 = new Date(start2.getTime() + 7200000)

  let error = null
  try {
    await engine.createTeamBooking({
      ground,
      actingUserId: user2.id,
      bookingPurpose: 'MATCH',
      startTime: start2,
      endTime: end2,
      teamId: team2.id,
      participantPlayerIds: [player2.id],
    })
  } catch (e) {
    error = e
  }

  assert.ok(error, 'Overlapping booking should fail')
  assert.equal(error.code, BOOKING_ERROR_CODES.GROUND_SLOT_UNAVAILABLE)
})

// ============================================================================
// TEST: Team Conflict Invariant
// ============================================================================

test('Team Invariant: Same team cannot overlap itself', async () => {
  await cleanupTest()
  const ground = await setupTestGround()
  const team = await setupTestTeam()
  const user1 = await setupTestUser()
  const player1 = await setupTestPlayer(user1.id, team.id)

  const start1 = new Date(Date.now() + 86400000)
  const end1 = new Date(start1.getTime() + 7200000)

  // First booking for this team
  await engine.createTeamBooking({
    ground,
    actingUserId: user1.id,
    bookingPurpose: 'MATCH',
    startTime: start1,
    endTime: end1,
    teamId: team.id,
    participantPlayerIds: [player1.id],
  })

  // Same team at a different ground, different time: should succeed
  const ground2 = await setupTestGround()
  const start2 = new Date(Date.now() + 172800000)
  const end2 = new Date(start2.getTime() + 7200000)

  const b2 = await engine.createTeamBooking({
    ground: ground2,
    actingUserId: user1.id,
    bookingPurpose: 'MATCH',
    startTime: start2,
    endTime: end2,
    teamId: team.id,
    participantPlayerIds: [player1.id],
  })
  assert.equal(b2.booking.status, 'CONFIRMED')

  // Same team at same ground, overlapping time: should fail
  const start3 = new Date(start1.getTime() + 3600000)
  const end3 = new Date(start3.getTime() + 3600000)

  let error = null
  try {
    await engine.createTeamBooking({
      ground,
      actingUserId: user1.id,
      bookingPurpose: 'PRACTICE',
      startTime: start3,
      endTime: end3,
      teamId: team.id,
      participantPlayerIds: [player1.id],
    })
  } catch (e) {
    error = e
  }

  assert.ok(error, 'Same team overlapping should fail')
  assert.equal(error.code, BOOKING_ERROR_CODES.TEAM_TIME_CONFLICT)
})

// ============================================================================
// TEST: Player Conflict Invariant
// ============================================================================

test('Player Invariant: Same player cannot overlap across teams', async () => {
  await cleanupTest()
  const ground = await setupTestGround()
  const team1 = await setupTestTeam()
  const team2 = await setupTestTeam()
  const user = await setupTestUser()
  const player = await setupTestPlayer(user.id, team1.id)

  // Update player to be on team 2 (players can belong to only one team currently)
  // Actually, looking at schema, players.team_id is single, so update it
  await db.query(`UPDATE players SET team_id = $1 WHERE id = $2`, [team1.id, player.id])

  const start1 = new Date(Date.now() + 86400000)
  const end1 = new Date(start1.getTime() + 7200000)

  // Booking 1: player on team1, 6-8
  const b1 = await engine.createTeamBooking({
    ground,
    actingUserId: user.id,
    bookingPurpose: 'MATCH',
    startTime: start1,
    endTime: end1,
    teamId: team1.id,
    participantPlayerIds: [player.id],
  })
  assert.equal(b1.booking.status, 'CONFIRMED')

  // Now change player's team to team2
  await db.query(`UPDATE players SET team_id = $1 WHERE id = $2`, [team2.id, player.id])

  // Booking 2: same player on team2, overlapping time should fail
  const start2 = new Date(start1.getTime() + 3600000)
  const end2 = new Date(start2.getTime() + 3600000)

  let error = null
  try {
    await engine.createTeamBooking({
      ground,
      actingUserId: user.id,
      bookingPurpose: 'MATCH',
      startTime: start2,
      endTime: end2,
      teamId: team2.id,
      participantPlayerIds: [player.id],
    })
  } catch (e) {
    error = e
  }

  assert.ok(error, 'Same player overlapping should fail')
  assert.equal(error.code, BOOKING_ERROR_CODES.PLAYER_TIME_CONFLICT)
})

// ============================================================================
// TEST: Proposal Invariant - Concurrent Acceptance
// ============================================================================

test('Proposal Invariant: Concurrent acceptance - only one team wins', async () => {
  await cleanupTest()
  const ground = await setupTestGround()
  const teamA = await setupTestTeam()
  const teamB = await setupTestTeam()
  const teamC = await setupTestTeam()

  const userA = await setupTestUser()
  const playerA = await setupTestPlayer(userA.id, teamA.id)

  const userB = await setupTestUser()
  const playerB = await setupTestPlayer(userB.id, teamB.id)

  const userC = await setupTestUser()
  const playerC = await setupTestPlayer(userC.id, teamC.id)

  const startTime = new Date(Date.now() + 86400000)
  const endTime = new Date(startTime.getTime() + 7200000)

  // Create proposal by team A
  const proposal = await proposalService.createMatchProposal({
    ground,
    actingUserId: userA.id,
    bookingPurpose: 'MATCH',
    startTime,
    endTime,
    teamId: teamA.id,
    participantPlayerIds: [playerA.id],
  })

  // Two concurrent acceptance attempts
  const accept1 = proposalService.acceptMatchProposal({
    publicProposalId: proposal.proposal.public_proposal_id,
    actingUserId: userB.id,
    acceptingTeamId: teamB.id,
    participantPlayerIds: [playerB.id],
  })

  const accept2 = proposalService.acceptMatchProposal({
    publicProposalId: proposal.proposal.public_proposal_id,
    actingUserId: userC.id,
    acceptingTeamId: teamC.id,
    participantPlayerIds: [playerC.id],
  })

  const results = await Promise.allSettled([accept1, accept2])

  // Count successes
  const successes = results.filter((r) => r.status === 'fulfilled')
  assert.equal(successes.length, 1, 'Exactly one acceptance should succeed')

  // Verify database consistency
  const checkProposal = await db.query(`SELECT * FROM match_proposals WHERE public_proposal_id = $1`, [proposal.proposal.public_proposal_id])
  assert.equal(checkProposal.rows[0].status, 'CONFIRMED', 'Proposal should be CONFIRMED')
  assert.ok(checkProposal.rows[0].accepted_by_team_id, 'Proposal should have accepted_by_team_id')

  // Verify only one booking exists
  const checkBooking = await db.query(
    `SELECT COUNT(*) as cnt FROM booking_teams WHERE booking_id = $1`,
    [checkProposal.rows[0].booking_id]
  )
  assert.equal(checkBooking.rows[0].cnt, 2, 'Exactly two teams should be on the booking')
})

// ============================================================================
// TEST: Authorization Invariant
// ============================================================================

test('Authorization Invariant: Cannot modify another team\'s booking', async () => {
  await cleanupTest()
  const ground = await setupTestGround()
  const teamA = await setupTestTeam()
  const teamB = await setupTestTeam()

  const userA = await setupTestUser()
  const playerA = await setupTestPlayer(userA.id, teamA.id)

  const userB = await setupTestUser()
  await setupTestPlayer(userB.id, teamB.id)

  const startTime = new Date(Date.now() + 86400000)
  const endTime = new Date(startTime.getTime() + 7200000)

  // Team A creates booking
  const booking = await engine.createTeamBooking({
    ground,
    actingUserId: userA.id,
    bookingPurpose: 'MATCH',
    startTime,
    endTime,
    teamId: teamA.id,
    participantPlayerIds: [playerA.id],
  })

  // Team B tries to cancel team A's booking
  let error = null
  try {
    await engine.cancelTeamBooking(booking.booking.public_booking_id, {
      actingUserId: userB.id,
      isStaff: false,
    })
  } catch (e) {
    error = e
  }

  assert.ok(error, 'Team B should not be able to cancel Team A booking')
  assert.equal(error.code, BOOKING_ERROR_CODES.FORBIDDEN)
})

// ============================================================================
// TEST: Status Transition Invariant
// ============================================================================

test('Status Invariant: Cannot transition to invalid status', async () => {
  await cleanupTest()
  const ground = await setupTestGround()
  const team = await setupTestTeam()
  const user = await setupTestUser()
  const player = await setupTestPlayer(user.id, team.id)

  const startTime = new Date(Date.now() + 86400000)
  const endTime = new Date(startTime.getTime() + 7200000)

  // Create booking
  const booking = await engine.createTeamBooking({
    ground,
    actingUserId: user.id,
    bookingPurpose: 'MATCH',
    startTime,
    endTime,
    teamId: team.id,
    participantPlayerIds: [player.id],
  })

  // Try to cancel
  const cancelled = await engine.cancelTeamBooking(booking.booking.public_booking_id, {
    actingUserId: user.id,
    isStaff: false,
  })
  assert.equal(cancelled.status, 'CANCELLED')

  // Try to cancel again (already cancelled)
  let error = null
  try {
    await engine.cancelTeamBooking(booking.booking.public_booking_id, {
      actingUserId: user.id,
      isStaff: false,
    })
  } catch (e) {
    error = e
  }

  assert.ok(error, 'Cannot cancel an already-cancelled booking')
})

// ============================================================================
// TEST: Idempotency (Replay Protection)
// ============================================================================

test('Idempotency: Replay of create booking request returns same booking', async () => {
  await cleanupTest()
  const ground = await setupTestGround()
  const team = await setupTestTeam()
  const user = await setupTestUser()
  const player = await setupTestPlayer(user.id, team.id)

  const startTime = new Date(Date.now() + 86400000)
  const endTime = new Date(startTime.getTime() + 7200000)
  const clientActionId = `action-${Date.now()}`

  // First create
  const b1 = await engine.createTeamBooking({
    ground,
    actingUserId: user.id,
    bookingPurpose: 'MATCH',
    startTime,
    endTime,
    teamId: team.id,
    participantPlayerIds: [player.id],
    clientActionId,
  })

  // Replay with same clientActionId
  const b2 = await engine.createTeamBooking({
    ground,
    actingUserId: user.id,
    bookingPurpose: 'MATCH',
    startTime,
    endTime,
    teamId: team.id,
    participantPlayerIds: [player.id],
    clientActionId,
  })

  assert.equal(b1.booking.id, b2.booking.id, 'Should return same booking')
  assert.equal(b2.idempotentReplay, true, 'Should be marked as replay')
})

await cleanupTest()
