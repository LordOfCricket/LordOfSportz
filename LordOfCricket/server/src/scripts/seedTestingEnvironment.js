import 'dotenv/config'
import { fileURLToPath } from 'url'
import { randomUUID } from 'crypto'
import bcrypt from 'bcryptjs'
import { pool } from '../config/db.js'
import { findUserByEmail } from '../models/user.model.js'
import { findStaffRoleByName } from '../models/staffRole.model.js'
import { generateAdminId } from '../utils/adminId.js'
import { validatePasswordPolicy } from '../domain/otpAuth/password.js'
import { generatePublicId } from '../utils/publicId.js'
import { slugify } from '../utils/slug.js'
import { createGround, findGroundBySlug } from '../models/ground.model.js'
import { createMembership, findActiveMembership } from '../models/groundUser.model.js'
import { createPricingSlot, listActivePricingSlots } from '../services/groundPricing.service.js'
import { createPlayer, findPlayerByUserId } from '../models/player.model.js'
import { createTeamByPlayer } from '../services/teamCreation.service.js'
import { addPlayerToTeamRoster } from '../services/teamRoster.service.js'
import { createUmpireRequest, findLatestUmpireRequestForUser, decideUmpireRequest } from '../models/umpireRequest.model.js'
import * as bookingService from '../services/groundBooking.service.js'
import * as matchService from '../services/match.service.js'
import * as umpireAssignmentService from '../services/umpireAssignment.service.js'
import { findPermissionByKey, hasActivePermission, grantPermission } from '../models/permission.model.js'
import { pool as db } from '../config/db.js'

// Testing Environment Seed — creates ONE deterministic, clearly-labeled test
// account per role (<role>@gmail.com) plus one disposable "LOC Test
// Ground" and a small amount of test data, so a non-developer tester can log
// in with email+password and exercise every role WITHOUT needing Twilio/OTP.
//
// Deliberately reuses existing model/service functions throughout (same
// createGround/createMembership/createPricingSlot/createPlayer/createTeamByPlayer/
// addPlayerToTeamRoster/createUmpireRequest+decideUmpireRequest/createBooking/
// createMatch/applyForSlot this app's own routes already call) — nothing here
// is a new code path, only a new caller of existing ones, same posture as
// bootstrapSuperAdmin.js/seedGroundAndCanteen.js/seedGroundMembership.js.
//
// The ONE deliberate departure from production behavior: every test account
// gets a real password_hash set directly (bcrypt cost 10, same as
// bootstrapSuperAdmin.js), including the STAFF account, which in real
// production is created OTP-only (no password until the user sets one).
// This is necessary and safe here — it's the only way a non-technical tester
// can log in without depending on someone's personal Twilio account or
// reading server console output for an OTP code — and it changes no
// authorization/authentication CODE, only which rows already have a password.
//
// Idempotent: every step checks for an existing row first and skips it,
// same convention as every sibling script — safe to re-run.

const TEST_PASSWORD = 'LocTester#2026'
const GROUND_SLUG = 'loc-test-ground'
const GROUND_NAME = 'LOC Test Ground'

const ACCOUNTS = {
  superAdmin: { label: 'SUPER_ADMIN', email: 'superadmin@gmail.com', name: 'LOC Test Super Admin' },
  owner: { label: 'GROUND_OWNER', email: 'owner@gmail.com', name: 'LOC Test Ground Owner' },
  staff: { label: 'STAFF / GROUND_ADMIN', email: 'staff@gmail.com', name: 'LOC Test Staff' },
  umpire: { label: 'UMPIRE', email: 'umpire@gmail.com', name: 'LOC Test Umpire' },
  player: { label: 'PLAYER', email: 'player@gmail.com', name: 'LOC Test Player' },
}

const STAFF_PERMISSIONS = ['MATCH_VIEW', 'MATCH_MANAGE', 'UMPIRE_MANAGE', 'BOOKING_VIEW', 'BOOKING_MANAGE', 'PRICING_VIEW', 'PRICING_MANAGE', 'STAFF_VIEW']

function todayPlusDays(days) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

// Legacy -> current test-account email map. Older seeded databases hold the
// `loc-test-*@loctest.local` addresses; rename those rows in place so every
// FK-linked thing (password, role, player_type, permissions, umpire request,
// ground/team membership, match assignments, verification state) is kept
// exactly as-is. Only ever matches these 5 known local test addresses, so
// it's a no-op on a fresh DB and on production.
const LEGACY_EMAIL_MAP = {
  'loc-test-superadmin@loctest.local': ACCOUNTS.superAdmin.email,
  'loc-test-owner@loctest.local': ACCOUNTS.owner.email,
  'loc-test-staff@loctest.local': ACCOUNTS.staff.email,
  'loc-test-umpire@loctest.local': ACCOUNTS.umpire.email,
  'loc-test-player@loctest.local': ACCOUNTS.player.email,
}

async function renameLegacyTestAccounts() {
  const results = []
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    for (const [oldEmail, newEmail] of Object.entries(LEGACY_EMAIL_MAP)) {
      // Rename only when the legacy row exists AND the new address is free —
      // never merge, never overwrite an existing account.
      const { rows } = await client.query(
        `UPDATE users
            SET email = $2, updated_at = NOW()
          WHERE email = $1
            AND NOT EXISTS (SELECT 1 FROM users WHERE email = $2)
        RETURNING id`,
        [oldEmail, newEmail],
      )
      if (rows.length) results.push({ from: oldEmail, to: newEmail, userId: rows[0].id })
    }
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
  return results
}

async function upsertPasswordUser({ name, email, role, staffRoleId = null, playerType = null }) {
  const existing = await findUserByEmail(email)
  if (existing) return { user: existing, inserted: false }

  const policy = validatePasswordPolicy(TEST_PASSWORD)
  if (!policy.valid) throw new Error(`TEST_PASSWORD fails the app's own password policy: ${policy.reason}`)
  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10)

  let staffId = null
  if (role === 'staff') staffId = await generateAdminId()

  const { rows } = await pool.query(
    `INSERT INTO users (name, email, password_hash, role, staff_id, staff_role_id, player_type, status, force_password_change)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'ACTIVE', FALSE)
     RETURNING *`,
    [name, email, passwordHash, role, staffId, staffRoleId, playerType],
  )
  return { user: rows[0], inserted: true }
}

async function ensureGroundMembership(groundId, userId, role) {
  const existing = await findActiveMembership(userId, groundId, role)
  if (existing) return { membership: existing, inserted: false }
  const membership = await createMembership({ groundId, userId, role })
  return { membership, inserted: true }
}

async function ensureStaffPermission(groundUserId, permissionKey, grantedBy) {
  const already = await hasActivePermission(groundUserId, permissionKey)
  if (already) return false
  const permission = await findPermissionByKey(permissionKey)
  if (!permission) throw new Error(`Unknown permission key: ${permissionKey}`)
  await grantPermission({ groundUserId, permissionId: permission.id, grantedBy })
  return true
}

async function main() {
  const report = { renamedLegacyAccounts: [], accounts: {}, ground: null, pricingSlot: null, staffPermissions: [], team: null, bookings: [], match: null, umpireAssignment: null }

  // Bring any previously-seeded DB up to the current email scheme BEFORE the
  // upserts below run, so they find the renamed rows instead of inserting
  // duplicates.
  report.renamedLegacyAccounts = await renameLegacyTestAccounts()

  const superAdminRoleId = (await findStaffRoleByName('super_admin')).id
  const { user: superAdmin, inserted: superAdminInserted } = await upsertPasswordUser({ ...ACCOUNTS.superAdmin, role: 'staff', staffRoleId: superAdminRoleId })
  report.accounts.superAdmin = { email: superAdmin.email, inserted: superAdminInserted, id: superAdmin.id }

  const { user: owner, inserted: ownerInserted } = await upsertPasswordUser({ ...ACCOUNTS.owner, role: 'player' })
  report.accounts.owner = { email: owner.email, inserted: ownerInserted, id: owner.id }

  const { user: staff, inserted: staffInserted } = await upsertPasswordUser({ ...ACCOUNTS.staff, role: 'staff', staffRoleId: null })
  report.accounts.staff = { email: staff.email, inserted: staffInserted, id: staff.id }

  const { user: umpireUser, inserted: umpireInserted } = await upsertPasswordUser({ ...ACCOUNTS.umpire, role: 'player', playerType: 'umpire' })
  report.accounts.umpire = { email: umpireUser.email, inserted: umpireInserted, id: umpireUser.id }

  const { user: playerUser, inserted: playerInserted } = await upsertPasswordUser({ ...ACCOUNTS.player, role: 'player', playerType: 'team_player' })
  report.accounts.player = { email: playerUser.email, inserted: playerInserted, id: playerUser.id }

  // Ground
  let ground = await findGroundBySlug(GROUND_SLUG)
  let groundInserted = false
  if (!ground) {
    ground = await createGround({
      publicGroundId: generatePublicId('GRD', 8),
      slug: GROUND_SLUG,
      name: GROUND_NAME,
      description: 'Disposable ground for manual QA testing only — not a real venue.',
      addressLine: null,
      city: 'Test City',
      state: 'Test State',
      country: 'India',
      postalCode: null,
      latitude: null,
      longitude: null,
      phone: null,
      email: null,
      website: null,
      status: 'ACTIVE',
    })
    groundInserted = true
  }
  report.ground = { publicGroundId: ground.public_ground_id, slug: ground.slug, id: ground.id, inserted: groundInserted }

  // Memberships — owner full access to this ground only; staff GROUND_ADMIN on this ground only.
  const ownerMembership = await ensureGroundMembership(ground.id, owner.id, 'GROUND_OWNER')
  const staffMembership = await ensureGroundMembership(ground.id, staff.id, 'GROUND_ADMIN')

  for (const key of STAFF_PERMISSIONS) {
    const granted = await ensureStaffPermission(staffMembership.membership.id, key, owner.id)
    report.staffPermissions.push({ key, granted })
  }

  // One active pricing slot covering the whole operating window.
  const existingSlots = await listActivePricingSlots(ground.id)
  if (existingSlots.length === 0) {
    const slot = await createPricingSlot(ground, { startTime: '06:00', endTime: '22:00', price: 1500 }, owner.id)
    report.pricingSlot = { id: slot.id, price: Number(slot.price), inserted: true }
  } else {
    report.pricingSlot = { id: existingSlots[0].id, price: Number(existingSlots[0].price), inserted: false }
  }

  // Player + a team they own and are seated on (real "My Teams" experience).
  let player = await findPlayerByUserId(playerUser.id)
  if (!player) player = await createPlayer({ name: ACCOUNTS.player.name, teamId: null, role: 'BATSMAN', userId: playerUser.id })

  async function ensureTeam(name, shortName) {
    const { rows } = await db.query('SELECT * FROM teams WHERE owner_id = $1 AND name = $2', [playerUser.id, name])
    if (rows[0]) return rows[0]
    return createTeamByPlayer({ userId: playerUser.id, name, shortName })
  }

  const team = await ensureTeam('LOC Test Team', 'LTT')
  if (player.team_id !== team.id) {
    await addPlayerToTeamRoster(team.id, player.public_player_id)
  }
  const opponentTeam = await ensureTeam('LOC Test Opponent', 'LTO')
  report.team = { id: team.id, name: team.name, opponentId: opponentTeam.id }

  // Approve the umpire request (so the test umpire account is a real,
  // approved umpire — same isApprovedUmpireUser gate every real route uses).
  let latestRequest = await findLatestUmpireRequestForUser(umpireUser.id)
  if (!latestRequest) latestRequest = await createUmpireRequest(umpireUser.id)
  if (latestRequest.status !== 'approved') {
    latestRequest = await decideUmpireRequest(latestRequest.id, 'approved', superAdmin.id)
  }
  report.accounts.umpire.approved = true

  // A couple of test bookings on the test ground (future dates, priced from the slot above).
  const bookingDates = [todayPlusDays(3), todayPlusDays(4)]
  for (const dateStr of bookingDates) {
    try {
      const { rows: existingBooking } = await db.query(
        `SELECT public_booking_id, amount FROM ground_bookings WHERE ground_id = $1 AND user_id = $2 AND start_time::date = $3::date AND status = 'CONFIRMED'`,
        [ground.id, playerUser.id, dateStr],
      )
      if (existingBooking[0]) {
        report.bookings.push({ date: dateStr, publicBookingId: existingBooking[0].public_booking_id, amount: existingBooking[0].amount, inserted: false })
        continue
      }
      const { booking } = await bookingService.createBooking({
        dateStr,
        hour: 8,
        minute: 0,
        userId: playerUser.id,
        customerName: ACCOUNTS.player.name,
        clientActionId: randomUUID(),
        groundId: ground.id,
      })
      report.bookings.push({ date: dateStr, publicBookingId: booking.public_booking_id, amount: booking.amount, inserted: true })
    } catch (err) {
      report.bookings.push({ date: dateStr, error: err.message })
    }
  }

  // A test match, with the test umpire assigned via the real self-apply flow.
  const { rows: existingMatch } = await db.query(
    `SELECT * FROM matches WHERE ground_id = $1 AND team_a_id = $2 AND team_b_id = $3 AND status = 'upcoming'`,
    [ground.id, team.id, opponentTeam.id],
  )
  let match = existingMatch[0]
  if (!match) {
    match = await matchService.createMatch({
      teamAId: team.id,
      teamBId: opponentTeam.id,
      venue: GROUND_NAME,
      matchDate: `${todayPlusDays(7)}T09:00:00`,
      oversPerInnings: 10,
      ballsPerOver: 6,
      groundId: ground.id,
      requiredUmpires: 1,
    })
  }
  report.match = { id: match.id, matchDate: match.match_date }

  try {
    await umpireAssignmentService.applyForSlot({ matchId: match.id, user: { id: umpireUser.id, role: 'player', player_type: 'umpire' } })
    report.umpireAssignment = { matchId: match.id, umpireUserId: umpireUser.id, status: 'assigned' }
  } catch (err) {
    report.umpireAssignment = { matchId: match.id, error: err.message }
  }

  return report
}

const isMainModule = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]

if (isMainModule) {
  main()
    .then((report) => {
      console.log(JSON.stringify(report, null, 2))
      console.log('\n✅ Testing environment seed complete.')
    })
    .catch((err) => {
      console.error('Seed script failed:', err)
      process.exitCode = 1
    })
    .finally(async () => {
      await pool.end()
    })
}
