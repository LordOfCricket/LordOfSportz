// Phase 25 — match proposals, proved against real PostgreSQL. Same
// convention as teamBooking.integration.test.js: exercises the services
// directly (bookingConflict.service.js's createTeamBooking for setting up
// competing direct bookings, matchProposal.service.js for the proposal
// lifecycle itself), since the transaction/EXCLUDE-constraint/atomic-claim
// behavior being proved lives there, not in Express routing.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pool } from '../../config/db.js'
import { createPlayer } from '../../models/player.model.js'
import { generatePublicId } from '../../utils/publicId.js'
import * as engine from '../../services/bookingConflict.service.js'
import * as proposals from '../../services/matchProposal.service.js'
import * as proposalRepo from '../../repositories/matchProposal.repository.js'
import { BookingError } from '../../domain/booking/errors.js'
import { groundTodayDateStr, addDaysToDateStr, groundLocalToUtc } from '../../domain/shared/groundTime.js'

const DAY = addDaysToDateStr(groundTodayDateStr(), 20)

async function makeGround(overrides = {}) {
  const { rows } = await pool.query(
    `INSERT INTO grounds (public_ground_id, slug, name, status, opening_hour, closing_hour) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [
      generatePublicId('GRD'),
      `proposal-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      overrides.name || 'Proposal Test Ground',
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
    [name, `proposal-test-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`]
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

function slot(hourOffset = 0) {
  return { startTime: groundLocalToUtc(DAY, 6 + hourOffset, 0), endTime: groundLocalToUtc(DAY, 8 + hourOffset, 0) }
}

// ---------------------------------------------------------------------------
// Creation
// ---------------------------------------------------------------------------

test('CREATE: a valid proposal reserves the ground + proposing team + players immediately, status OPEN/PROPOSED', async () => {
  const ground = await makeGround()
  const teamA = await makeTeam('Create Team A')
  const { user, player } = await makeUserWithPlayer('Create Player A', teamA.id)
  try {
    const { startTime, endTime } = slot()
    const { proposal, booking } = await proposals.createMatchProposal({
      ground, actingUserId: user.id, startTime, endTime, teamId: teamA.id, participantPlayerIds: [player.id],
    })
    assert.equal(proposal.status, 'OPEN')
    assert.equal(booking.status, 'PROPOSED')
    assert.equal(booking.booking_purpose, 'MATCH')
    assert.equal(proposal.booking_id, booking.id)
    assert.equal(booking.proposal_id, proposal.id)

    const { rows: teamSlotRows } = await pool.query('SELECT * FROM booking_team_slots WHERE booking_id = $1', [booking.id])
    assert.equal(teamSlotRows.length, 1, 'only the proposing team holds a slot before acceptance')
    const { rows: playerSlotRows } = await pool.query('SELECT * FROM booking_player_slots WHERE booking_id = $1', [booking.id])
    assert.equal(playerSlotRows.length, 1)
  } finally {
    await cleanup({ groundIds: [ground.id], teamIds: [teamA.id], playerIds: [player.id], userIds: [user.id] })
  }
})

test('CREATE: a SUSPENDED ground rejects proposal creation with GROUND_CLOSED', async () => {
  const ground = await makeGround({ status: 'SUSPENDED' })
  const team = await makeTeam('Suspended Ground Team')
  const { user, player } = await makeUserWithPlayer('Suspended Ground Player', team.id)
  try {
    const { startTime, endTime } = slot()
    await assert.rejects(
      () => proposals.createMatchProposal({ ground, actingUserId: user.id, startTime, endTime, teamId: team.id, participantPlayerIds: [player.id] }),
      (err) => err instanceof BookingError && err.code === 'GROUND_CLOSED'
    )
  } finally {
    await cleanup({ groundIds: [ground.id], teamIds: [team.id], playerIds: [player.id], userIds: [user.id] })
  }
})

test('CREATE: outside operating hours, a past start time, and end<=start are all rejected', async () => {
  const ground = await makeGround({ openingHour: 9, closingHour: 18 })
  const team = await makeTeam('Hours Team')
  const { user, player } = await makeUserWithPlayer('Hours Player', team.id)
  try {
    await assert.rejects(
      () => proposals.createMatchProposal({ ground, actingUserId: user.id, startTime: groundLocalToUtc(DAY, 6, 0), endTime: groundLocalToUtc(DAY, 8, 0), teamId: team.id, participantPlayerIds: [player.id] }),
      (err) => err instanceof BookingError && err.code === 'INVALID_SLOT'
    )
    const past = addDaysToDateStr(groundTodayDateStr(), -5)
    await assert.rejects(
      () => proposals.createMatchProposal({ ground, actingUserId: user.id, startTime: groundLocalToUtc(past, 10, 0), endTime: groundLocalToUtc(past, 12, 0), teamId: team.id, participantPlayerIds: [player.id] }),
      (err) => err instanceof BookingError && err.code === 'PAST_TIME'
    )
    await assert.rejects(
      () => proposals.createMatchProposal({ ground, actingUserId: user.id, startTime: groundLocalToUtc(DAY, 12, 0), endTime: groundLocalToUtc(DAY, 10, 0), teamId: team.id, participantPlayerIds: [player.id] }),
      (err) => err instanceof BookingError && err.code === 'INVALID_SLOT'
    )
  } finally {
    await cleanup({ groundIds: [ground.id], teamIds: [team.id], playerIds: [player.id], userIds: [user.id] })
  }
})

test('CREATE: a player not on the proposing team cannot create a proposal for it', async () => {
  const ground = await makeGround()
  const team = await makeTeam('Unauthorized Create Team')
  const outsiderTeam = await makeTeam('Unauthorized Create Outsider')
  const { user: outsider } = await makeUserWithPlayer('Unauthorized Create Outsider Player', outsiderTeam.id)
  const { player: teamPlayer } = await makeUserWithPlayer('Unauthorized Create Team Player', team.id)
  try {
    const { startTime, endTime } = slot()
    await assert.rejects(
      () => proposals.createMatchProposal({ ground, actingUserId: outsider.id, startTime, endTime, teamId: team.id, participantPlayerIds: [teamPlayer.id] }),
      (err) => err instanceof BookingError && err.code === 'UNAUTHORIZED_TEAM_ACTION'
    )
  } finally {
    await cleanup({ groundIds: [ground.id], teamIds: [team.id, outsiderTeam.id], playerIds: [teamPlayer.id], userIds: [outsider.id] })
  }
})

test('CREATE: duplicate participant ids are rejected; a player already committed elsewhere is PLAYER_TIME_CONFLICT', async () => {
  const ground = await makeGround()
  const groundOther = await makeGround({ name: 'Other Ground' })
  const teamA = await makeTeam('Dup Team A')
  const teamB = await makeTeam('Dup Team B')
  const { user: userA, player: playerA } = await makeUserWithPlayer('Dup Player A', teamA.id)
  const { user: userB, player: busyPlayer } = await makeUserWithPlayer('Dup Busy Player', teamB.id)
  try {
    const { startTime, endTime } = slot()
    await assert.rejects(
      () => proposals.createMatchProposal({ ground, actingUserId: userA.id, startTime, endTime, teamId: teamA.id, participantPlayerIds: [playerA.id, playerA.id] }),
      (err) => err instanceof BookingError && err.code === 'DUPLICATE_PARTICIPANT'
    )

    await engine.createTeamBooking({ ground: groundOther, actingUserId: userB.id, bookingPurpose: 'PRACTICE', startTime, endTime, teamId: teamB.id, participantPlayerIds: [busyPlayer.id] })
    await assert.rejects(
      () => proposals.createMatchProposal({ ground, actingUserId: userA.id, startTime, endTime, teamId: teamA.id, participantPlayerIds: [playerA.id, busyPlayer.id] }),
      (err) => err instanceof BookingError && err.code === 'PLAYER_TIME_CONFLICT'
    )
  } finally {
    await cleanup({ groundIds: [ground.id, groundOther.id], teamIds: [teamA.id, teamB.id], playerIds: [playerA.id, busyPlayer.id], userIds: [userA.id, userB.id] })
  }
})

test('CREATE: a team already committed elsewhere (even a different ground) cannot open a proposal for an overlapping time', async () => {
  const ground = await makeGround()
  const groundOther = await makeGround({ name: 'Team Conflict Other Ground' })
  const team = await makeTeam('Team Conflict Team')
  const { user, player } = await makeUserWithPlayer('Team Conflict Player', team.id)
  try {
    const { startTime, endTime } = slot()
    await engine.createTeamBooking({ ground: groundOther, actingUserId: user.id, bookingPurpose: 'PRACTICE', startTime, endTime, teamId: team.id, participantPlayerIds: [player.id] })
    await assert.rejects(
      () => proposals.createMatchProposal({ ground, actingUserId: user.id, startTime, endTime, teamId: team.id, participantPlayerIds: [player.id] }),
      (err) => err instanceof BookingError && err.code === 'TEAM_TIME_CONFLICT'
    )
  } finally {
    await cleanup({ groundIds: [ground.id, groundOther.id], teamIds: [team.id], playerIds: [player.id], userIds: [user.id] })
  }
})

test('CREATE: duplicate/overlapping proposals from the same team are rejected for free by the same team-slot EXCLUDE constraint', async () => {
  // Deliberately two DIFFERENT grounds — using the same ground would also
  // trip the ground-axis EXCLUDE constraint first (insertBookingWithSlots
  // inserts the parent ground_bookings row before any team slot), which
  // would report GROUND_SLOT_UNAVAILABLE instead of isolating the team
  // axis this test is actually about.
  const groundX = await makeGround({ name: 'Dup Proposal Ground X' })
  const groundY = await makeGround({ name: 'Dup Proposal Ground Y' })
  const team = await makeTeam('Dup Proposal Team')
  const { user, player } = await makeUserWithPlayer('Dup Proposal Player', team.id)
  try {
    const { startTime, endTime } = slot()
    await proposals.createMatchProposal({ ground: groundX, actingUserId: user.id, startTime, endTime, teamId: team.id, participantPlayerIds: [player.id] })
    await assert.rejects(
      () => proposals.createMatchProposal({ ground: groundY, actingUserId: user.id, startTime: slot(1).startTime, endTime: slot(1).endTime, teamId: team.id, participantPlayerIds: [player.id] }),
      (err) => err instanceof BookingError && err.code === 'TEAM_TIME_CONFLICT'
    )
  } finally {
    await cleanup({ groundIds: [groundX.id, groundY.id], teamIds: [team.id], playerIds: [player.id], userIds: [user.id] })
  }
})

test('CREATE: an OPEN proposal counts toward the open-proposal-per-team limit', async () => {
  const ground = await makeGround();
  const team = await makeTeam('Proposal Limit Team')
  const { user, player } = await makeUserWithPlayer('Proposal Limit Player', team.id)
  const created = []
  try {
    for (let i = 0; i < 5; i++) {
      const { startTime, endTime } = slot(i * 3)
      const { proposal } = await proposals.createMatchProposal({ ground, actingUserId: user.id, startTime, endTime, teamId: team.id, participantPlayerIds: [player.id] })
      created.push(proposal)
    }
    const { startTime, endTime } = slot(14) // 20:00-22:00, still within the default 6-22 operating hours
    await assert.rejects(
      () => proposals.createMatchProposal({ ground, actingUserId: user.id, startTime, endTime, teamId: team.id, participantPlayerIds: [player.id] }),
      (err) => err instanceof BookingError && err.code === 'OPEN_PROPOSAL_LIMIT_REACHED'
    )
  } finally {
    await cleanup({ groundIds: [ground.id], teamIds: [team.id], playerIds: [player.id], userIds: [user.id] })
  }
})

// ---------------------------------------------------------------------------
// Acceptance
// ---------------------------------------------------------------------------

async function makeOpenProposal(ground, proposingTeam, proposingUser, proposingPlayer, timeSlot = slot()) {
  return proposals.createMatchProposal({
    ground, actingUserId: proposingUser.id, startTime: timeSlot.startTime, endTime: timeSlot.endTime,
    teamId: proposingTeam.id, participantPlayerIds: [proposingPlayer.id],
  })
}

test('ACCEPT: a valid acceptance confirms the booking with BOTH teams attached, and the proposal is CONFIRMED', async () => {
  const ground = await makeGround()
  const teamA = await makeTeam('Accept Team A')
  const teamB = await makeTeam('Accept Team B')
  const { user: userA, player: playerA } = await makeUserWithPlayer('Accept Player A', teamA.id)
  const { user: userB, player: playerB } = await makeUserWithPlayer('Accept Player B', teamB.id)
  try {
    const { proposal } = await makeOpenProposal(ground, teamA, userA, playerA)
    const result = await proposals.acceptMatchProposal({ publicProposalId: proposal.public_proposal_id, actingUserId: userB.id, acceptingTeamId: teamB.id, participantPlayerIds: [playerB.id] })
    assert.equal(result.proposal.status, 'CONFIRMED')
    assert.equal(result.proposal.accepted_by_team_id, teamB.id)
    assert.equal(result.booking.status, 'CONFIRMED')

    const teams = await pool.query('SELECT team_id, role FROM booking_teams WHERE booking_id = $1 ORDER BY role', [result.booking.id])
    assert.equal(teams.rows.length, 2)
    const teamIds = teams.rows.map((r) => r.team_id).sort((a, b) => a - b)
    assert.deepEqual(teamIds.sort((a, b) => a - b), [teamA.id, teamB.id].sort((a, b) => a - b))

    const participants = await pool.query('SELECT player_id FROM booking_participants WHERE booking_id = $1', [result.booking.id])
    assert.equal(participants.rows.length, 2, 'both proposing and accepting players are recorded')
  } finally {
    await cleanup({ groundIds: [ground.id], teamIds: [teamA.id, teamB.id], playerIds: [playerA.id, playerB.id], userIds: [userA.id, userB.id] })
  }
})

test('ACCEPT: a team cannot accept its own proposal (SELF_ACCEPT_NOT_ALLOWED)', async () => {
  const ground = await makeGround()
  const team = await makeTeam('Self Accept Team')
  const { user, player } = await makeUserWithPlayer('Self Accept Player', team.id)
  try {
    const { proposal } = await makeOpenProposal(ground, team, user, player)
    await assert.rejects(
      () => proposals.acceptMatchProposal({ publicProposalId: proposal.public_proposal_id, actingUserId: user.id, acceptingTeamId: team.id, participantPlayerIds: [player.id] }),
      (err) => err instanceof BookingError && err.code === 'SELF_ACCEPT_NOT_ALLOWED'
    )
  } finally {
    await cleanup({ groundIds: [ground.id], teamIds: [team.id], playerIds: [player.id], userIds: [user.id] })
  }
})

test('ACCEPT: a user not on the accepting team cannot accept on its behalf', async () => {
  const ground = await makeGround()
  const teamA = await makeTeam('Unauth Accept Team A')
  const teamB = await makeTeam('Unauth Accept Team B')
  const outsiderTeam = await makeTeam('Unauth Accept Outsider')
  const { user: userA, player: playerA } = await makeUserWithPlayer('Unauth Accept Player A', teamA.id)
  const { user: outsider } = await makeUserWithPlayer('Unauth Accept Outsider Player', outsiderTeam.id)
  const { player: playerB } = await makeUserWithPlayer('Unauth Accept Player B', teamB.id)
  try {
    const { proposal } = await makeOpenProposal(ground, teamA, userA, playerA)
    await assert.rejects(
      () => proposals.acceptMatchProposal({ publicProposalId: proposal.public_proposal_id, actingUserId: outsider.id, acceptingTeamId: teamB.id, participantPlayerIds: [playerB.id] }),
      (err) => err instanceof BookingError && err.code === 'UNAUTHORIZED_TEAM_ACTION'
    )
  } finally {
    await cleanup({ groundIds: [ground.id], teamIds: [teamA.id, teamB.id, outsiderTeam.id], playerIds: [playerA.id, playerB.id], userIds: [userA.id, outsider.id] })
  }
})

test('ACCEPT: an expired proposal cannot be accepted (PROPOSAL_EXPIRED), and the ground slot is freed', async () => {
  const ground = await makeGround()
  const teamA = await makeTeam('Expired Team A')
  const teamB = await makeTeam('Expired Team B')
  const { user: userA, player: playerA } = await makeUserWithPlayer('Expired Player A', teamA.id)
  const { user: userB, player: playerB } = await makeUserWithPlayer('Expired Player B', teamB.id)
  try {
    const { proposal, booking } = await makeOpenProposal(ground, teamA, userA, playerA)
    // Force it into the past without waiting a real TTL.
    await pool.query('UPDATE match_proposals SET proposal_expires_at = NOW() - interval \'1 minute\' WHERE id = $1', [proposal.id])
    await pool.query('UPDATE ground_bookings SET hold_expires_at = NOW() - interval \'1 minute\' WHERE id = $1', [booking.id])

    await assert.rejects(
      () => proposals.acceptMatchProposal({ publicProposalId: proposal.public_proposal_id, actingUserId: userB.id, acceptingTeamId: teamB.id, participantPlayerIds: [playerB.id] }),
      (err) => err instanceof BookingError && err.code === 'PROPOSAL_EXPIRED'
    )

    // The lazy sweep (triggered by the next booking attempt at this ground)
    // must free the slot — a new direct booking for the same time succeeds.
    const { booking: rebooked } = await engine.createTeamBooking({ ground, actingUserId: userB.id, bookingPurpose: 'PRACTICE', startTime: slot().startTime, endTime: slot().endTime, teamId: teamB.id, participantPlayerIds: [playerB.id] })
    assert.equal(rebooked.status, 'CONFIRMED')
  } finally {
    await cleanup({ groundIds: [ground.id], teamIds: [teamA.id, teamB.id], playerIds: [playerA.id, playerB.id], userIds: [userA.id, userB.id] })
  }
})

test('ACCEPT: a cancelled proposal cannot be accepted (PROPOSAL_CANCELLED)', async () => {
  const ground = await makeGround()
  const teamA = await makeTeam('Cancelled Team A')
  const teamB = await makeTeam('Cancelled Team B')
  const { user: userA, player: playerA } = await makeUserWithPlayer('Cancelled Player A', teamA.id)
  const { user: userB, player: playerB } = await makeUserWithPlayer('Cancelled Player B', teamB.id)
  try {
    const { proposal } = await makeOpenProposal(ground, teamA, userA, playerA)
    await proposals.cancelMatchProposal(proposal.public_proposal_id, { actingUserId: userA.id })
    await assert.rejects(
      () => proposals.acceptMatchProposal({ publicProposalId: proposal.public_proposal_id, actingUserId: userB.id, acceptingTeamId: teamB.id, participantPlayerIds: [playerB.id] }),
      (err) => err instanceof BookingError && err.code === 'PROPOSAL_CANCELLED'
    )
  } finally {
    await cleanup({ groundIds: [ground.id], teamIds: [teamA.id, teamB.id], playerIds: [playerA.id, playerB.id], userIds: [userA.id, userB.id] })
  }
})

test('ACCEPT: an already-accepted proposal rejects a second, different team (PROPOSAL_ALREADY_ACCEPTED); the winning team retrying is an idempotent no-op', async () => {
  const ground = await makeGround()
  const teamA = await makeTeam('Already Team A')
  const teamB = await makeTeam('Already Team B')
  const teamC = await makeTeam('Already Team C')
  const { user: userA, player: playerA } = await makeUserWithPlayer('Already Player A', teamA.id)
  const { user: userB, player: playerB } = await makeUserWithPlayer('Already Player B', teamB.id)
  const { user: userC, player: playerC } = await makeUserWithPlayer('Already Player C', teamC.id)
  try {
    const { proposal } = await makeOpenProposal(ground, teamA, userA, playerA)
    await proposals.acceptMatchProposal({ publicProposalId: proposal.public_proposal_id, actingUserId: userB.id, acceptingTeamId: teamB.id, participantPlayerIds: [playerB.id] })

    await assert.rejects(
      () => proposals.acceptMatchProposal({ publicProposalId: proposal.public_proposal_id, actingUserId: userC.id, acceptingTeamId: teamC.id, participantPlayerIds: [playerC.id] }),
      (err) => err instanceof BookingError && err.code === 'PROPOSAL_ALREADY_ACCEPTED'
    )

    const replay = await proposals.acceptMatchProposal({ publicProposalId: proposal.public_proposal_id, actingUserId: userB.id, acceptingTeamId: teamB.id, participantPlayerIds: [playerB.id] })
    assert.equal(replay.idempotentReplay, true)
    assert.equal(replay.proposal.status, 'CONFIRMED')
  } finally {
    await cleanup({ groundIds: [ground.id], teamIds: [teamA.id, teamB.id, teamC.id], playerIds: [playerA.id, playerB.id, playerC.id], userIds: [userA.id, userB.id, userC.id] })
  }
})

test('ACCEPT: the accepting team having a conflicting booking elsewhere fails with TEAM_TIME_CONFLICT, and the proposal remains genuinely OPEN', async () => {
  const ground = await makeGround()
  const groundOther = await makeGround({ name: 'Accept Team Conflict Other' })
  const teamA = await makeTeam('Accept Conflict Team A')
  const teamB = await makeTeam('Accept Conflict Team B')
  const { user: userA, player: playerA } = await makeUserWithPlayer('Accept Conflict Player A', teamA.id)
  const { user: userB, player: playerB } = await makeUserWithPlayer('Accept Conflict Player B', teamB.id)
  try {
    const { proposal } = await makeOpenProposal(ground, teamA, userA, playerA)
    await engine.createTeamBooking({ ground: groundOther, actingUserId: userB.id, bookingPurpose: 'PRACTICE', startTime: slot().startTime, endTime: slot().endTime, teamId: teamB.id, participantPlayerIds: [playerB.id] })

    await assert.rejects(
      () => proposals.acceptMatchProposal({ publicProposalId: proposal.public_proposal_id, actingUserId: userB.id, acceptingTeamId: teamB.id, participantPlayerIds: [playerB.id] }),
      (err) => err instanceof BookingError && err.code === 'TEAM_TIME_CONFLICT'
    )

    const stillOpen = await proposalRepo.findByPublicId(proposal.public_proposal_id)
    assert.equal(stillOpen.status, 'OPEN', 'a failed acceptance must roll back the claim too — the proposal stays OPEN')
    const { rows: onlyOneTeam } = await pool.query('SELECT * FROM booking_teams WHERE booking_id = $1', [stillOpen.booking_id])
    assert.equal(onlyOneTeam.length, 1, 'the failed accepting team must never remain attached')
  } finally {
    await cleanup({ groundIds: [ground.id, groundOther.id], teamIds: [teamA.id, teamB.id], playerIds: [playerA.id, playerB.id], userIds: [userA.id, userB.id] })
  }
})

test('ACCEPT: an accepting participant with a player conflict fails with PLAYER_TIME_CONFLICT and leaves the proposal OPEN', async () => {
  const ground = await makeGround()
  const groundOther = await makeGround({ name: 'Accept Player Conflict Other' })
  const teamA = await makeTeam('Accept PC Team A')
  const teamB = await makeTeam('Accept PC Team B')
  const busyTeam = await makeTeam('Accept PC Busy Team')
  const { user: userA, player: playerA } = await makeUserWithPlayer('Accept PC Player A', teamA.id)
  const { user: userB, player: playerB } = await makeUserWithPlayer('Accept PC Player B', teamB.id)
  const { user: busyUser } = await makeUserWithPlayer('Accept PC Busy Owner', busyTeam.id)
  try {
    const { proposal } = await makeOpenProposal(ground, teamA, userA, playerA)
    await engine.createTeamBooking({ ground: groundOther, actingUserId: busyUser.id, bookingPurpose: 'PRACTICE', startTime: slot().startTime, endTime: slot().endTime, teamId: busyTeam.id, participantPlayerIds: [playerB.id] })

    await assert.rejects(
      () => proposals.acceptMatchProposal({ publicProposalId: proposal.public_proposal_id, actingUserId: userB.id, acceptingTeamId: teamB.id, participantPlayerIds: [playerB.id] }),
      (err) => err instanceof BookingError && err.code === 'PLAYER_TIME_CONFLICT'
    )
    const stillOpen = await proposalRepo.findByPublicId(proposal.public_proposal_id)
    assert.equal(stillOpen.status, 'OPEN')
  } finally {
    await cleanup({ groundIds: [ground.id, groundOther.id], teamIds: [teamA.id, teamB.id, busyTeam.id], playerIds: [playerA.id, playerB.id], userIds: [userA.id, userB.id, busyUser.id] })
  }
})

test('ACCEPT: a ground suspended after proposal creation rejects acceptance with GROUND_CLOSED', async () => {
  const ground = await makeGround()
  const teamA = await makeTeam('Ground Closed Team A')
  const teamB = await makeTeam('Ground Closed Team B')
  const { user: userA, player: playerA } = await makeUserWithPlayer('Ground Closed Player A', teamA.id)
  const { user: userB, player: playerB } = await makeUserWithPlayer('Ground Closed Player B', teamB.id)
  try {
    const { proposal } = await makeOpenProposal(ground, teamA, userA, playerA)
    await pool.query(`UPDATE grounds SET status = 'SUSPENDED' WHERE id = $1`, [ground.id])

    await assert.rejects(
      () => proposals.acceptMatchProposal({ publicProposalId: proposal.public_proposal_id, actingUserId: userB.id, acceptingTeamId: teamB.id, participantPlayerIds: [playerB.id] }),
      (err) => err instanceof BookingError && err.code === 'GROUND_CLOSED'
    )
  } finally {
    await cleanup({ groundIds: [ground.id], teamIds: [teamA.id, teamB.id], playerIds: [playerA.id, playerB.id], userIds: [userA.id, userB.id] })
  }
})

// ---------------------------------------------------------------------------
// Cancellation
// ---------------------------------------------------------------------------

test('CANCEL: only a current proposing-team member can cancel an OPEN proposal; it releases the slot and is never silently deleted', async () => {
  const ground = await makeGround()
  const team = await makeTeam('Cancel Team')
  const outsiderTeam = await makeTeam('Cancel Outsider Team')
  const { user, player } = await makeUserWithPlayer('Cancel Player', team.id)
  const { user: outsider } = await makeUserWithPlayer('Cancel Outsider', outsiderTeam.id)
  try {
    const { proposal } = await makeOpenProposal(ground, team, user, player)

    await assert.rejects(
      () => proposals.cancelMatchProposal(proposal.public_proposal_id, { actingUserId: outsider.id }),
      (err) => err instanceof BookingError && err.code === 'UNAUTHORIZED_TEAM_ACTION'
    )

    const cancelled = await proposals.cancelMatchProposal(proposal.public_proposal_id, { actingUserId: user.id, reason: 'Changed plans' })
    assert.equal(cancelled.status, 'CANCELLED')

    const stillExists = await proposalRepo.findByPublicId(proposal.public_proposal_id)
    assert.ok(stillExists, 'the historical proposal row must never be deleted')
    assert.equal(stillExists.status, 'CANCELLED')

    const { rows: slotRows } = await pool.query('SELECT * FROM booking_team_slots WHERE booking_id = $1', [proposal.booking_id])
    assert.equal(slotRows.length, 0, 'cancellation must release the team slot')
  } finally {
    await cleanup({ groundIds: [ground.id], teamIds: [team.id, outsiderTeam.id], playerIds: [player.id], userIds: [user.id, outsider.id] })
  }
})

test('CANCEL: an already-accepted (CONFIRMED) proposal cannot be cancelled through the proposal-cancel endpoint — must use the ordinary booking cancel', async () => {
  const ground = await makeGround()
  const teamA = await makeTeam('Confirmed Cancel Team A')
  const teamB = await makeTeam('Confirmed Cancel Team B')
  const { user: userA, player: playerA } = await makeUserWithPlayer('Confirmed Cancel Player A', teamA.id)
  const { user: userB, player: playerB } = await makeUserWithPlayer('Confirmed Cancel Player B', teamB.id)
  try {
    const { proposal } = await makeOpenProposal(ground, teamA, userA, playerA)
    await proposals.acceptMatchProposal({ publicProposalId: proposal.public_proposal_id, actingUserId: userB.id, acceptingTeamId: teamB.id, participantPlayerIds: [playerB.id] })

    await assert.rejects(
      () => proposals.cancelMatchProposal(proposal.public_proposal_id, { actingUserId: userA.id }),
      (err) => err instanceof BookingError && err.code === 'PROPOSAL_ALREADY_ACCEPTED'
    )

    // The real cancel path for a confirmed match: ordinary booking cancel,
    // and it must ALSO keep match_proposals in sync (never orphaned at
    // CONFIRMED while its booking says CANCELLED).
    const booking = await pool.query('SELECT * FROM ground_bookings WHERE id = $1', [proposal.booking_id])
    const cancelled = await engine.cancelTeamBooking(booking.rows[0].public_booking_id, { actingUserId: userB.id })
    assert.equal(cancelled.status, 'CANCELLED')
    const syncedProposal = await proposalRepo.findByPublicId(proposal.public_proposal_id)
    assert.equal(syncedProposal.status, 'CANCELLED', 'match_proposals must be kept in sync with its booking, never left at CONFIRMED')
  } finally {
    await cleanup({ groundIds: [ground.id], teamIds: [teamA.id, teamB.id], playerIds: [playerA.id, playerB.id], userIds: [userA.id, userB.id] })
  }
})

// ---------------------------------------------------------------------------
// Concurrency
// ---------------------------------------------------------------------------

test('CONCURRENCY: two different teams accepting the same proposal simultaneously — exactly one wins', async () => {
  const ground = await makeGround()
  const teamA = await makeTeam('Conc Accept Team A')
  const teamB = await makeTeam('Conc Accept Team B')
  const teamC = await makeTeam('Conc Accept Team C')
  const { user: userA, player: playerA } = await makeUserWithPlayer('Conc Accept Player A', teamA.id)
  const { user: userB, player: playerB } = await makeUserWithPlayer('Conc Accept Player B', teamB.id)
  const { user: userC, player: playerC } = await makeUserWithPlayer('Conc Accept Player C', teamC.id)
  try {
    const { proposal } = await makeOpenProposal(ground, teamA, userA, playerA)

    const attempt = (userId, teamId, playerId) =>
      proposals.acceptMatchProposal({ publicProposalId: proposal.public_proposal_id, actingUserId: userId, acceptingTeamId: teamId, participantPlayerIds: [playerId] })
        .then(() => 'ALLOWED')
        .catch((err) => (err instanceof BookingError ? err.code : 'ERROR'))

    const results = await Promise.all([attempt(userB.id, teamB.id, playerB.id), attempt(userC.id, teamC.id, playerC.id)])
    assert.equal(results.filter((r) => r === 'ALLOWED').length, 1, `exactly one acceptance should win, got: ${JSON.stringify(results)}`)
    assert.equal(results.filter((r) => r === 'PROPOSAL_ALREADY_ACCEPTED').length, 1, `the loser should get PROPOSAL_ALREADY_ACCEPTED, got: ${JSON.stringify(results)}`)

    const { rows: teamRows } = await pool.query('SELECT team_id FROM booking_teams WHERE booking_id = $1', [proposal.booking_id])
    assert.equal(teamRows.length, 2, 'never more than the proposing team + exactly one accepting team')
  } finally {
    await cleanup({ groundIds: [ground.id], teamIds: [teamA.id, teamB.id, teamC.id], playerIds: [playerA.id, playerB.id, playerC.id], userIds: [userA.id, userB.id, userC.id] })
  }
})

test('CONCURRENCY: proposal acceptance vs a direct ground booking for the same ground/time — exactly one wins, never both', async () => {
  const ground = await makeGround()
  const teamA = await makeTeam('Conc GB Team A')
  const teamB = await makeTeam('Conc GB Team B')
  const teamC = await makeTeam('Conc GB Team C')
  const { user: userA, player: playerA } = await makeUserWithPlayer('Conc GB Player A', teamA.id)
  const { user: userB, player: playerB } = await makeUserWithPlayer('Conc GB Player B', teamB.id)
  const { user: userC, player: playerC } = await makeUserWithPlayer('Conc GB Player C', teamC.id)
  try {
    const { proposal, booking } = await makeOpenProposal(ground, teamA, userA, playerA)

    // The direct booking is guaranteed to lose (the ground slot was already
    // taken by the proposal's own PROPOSED row at creation time) — this
    // proves that guarantee holds even when raced concurrently against an
    // in-flight acceptance, not just "eventually".
    const acceptAttempt = proposals.acceptMatchProposal({ publicProposalId: proposal.public_proposal_id, actingUserId: userB.id, acceptingTeamId: teamB.id, participantPlayerIds: [playerB.id] }).then(() => 'ALLOWED').catch((err) => (err instanceof BookingError ? err.code : 'ERROR'))
    const directAttempt = engine.createTeamBooking({ ground, actingUserId: userC.id, bookingPurpose: 'PRACTICE', startTime: new Date(booking.start_time), endTime: new Date(booking.end_time), teamId: teamC.id, participantPlayerIds: [playerC.id] }).then(() => 'ALLOWED').catch((err) => (err instanceof BookingError ? err.code : 'ERROR'))

    const [acceptResult, directResult] = await Promise.all([acceptAttempt, directAttempt])
    assert.equal(acceptResult, 'ALLOWED', 'the proposal already held the ground slot — acceptance must win')
    assert.equal(directResult, 'GROUND_SLOT_UNAVAILABLE', 'the direct booking must lose regardless of timing')
  } finally {
    await cleanup({ groundIds: [ground.id], teamIds: [teamA.id, teamB.id, teamC.id], playerIds: [playerA.id, playerB.id, playerC.id], userIds: [userA.id, userB.id, userC.id] })
  }
})

test('CONCURRENCY: two teams creating overlapping proposals for the same team member — exactly one proposal creation succeeds', async () => {
  const groundX = await makeGround({ name: 'Conc Create Ground X' })
  const groundY = await makeGround({ name: 'Conc Create Ground Y' })
  const team = await makeTeam('Conc Create Team')
  const { user, player } = await makeUserWithPlayer('Conc Create Player', team.id)
  try {
    const { startTime, endTime } = slot()
    const attempt = (ground) =>
      proposals.createMatchProposal({ ground, actingUserId: user.id, startTime, endTime, teamId: team.id, participantPlayerIds: [player.id] })
        .then(() => 'ALLOWED')
        .catch((err) => (err instanceof BookingError ? err.code : 'ERROR'))

    const results = await Promise.all([attempt(groundX), attempt(groundY)])
    assert.equal(results.filter((r) => r === 'ALLOWED').length, 1, `exactly one should succeed (same team, overlapping time, different grounds), got: ${JSON.stringify(results)}`)
    assert.equal(results.filter((r) => r === 'TEAM_TIME_CONFLICT').length, 1)
  } finally {
    await cleanup({ groundIds: [groundX.id, groundY.id], teamIds: [team.id], playerIds: [player.id], userIds: [user.id] })
  }
})
