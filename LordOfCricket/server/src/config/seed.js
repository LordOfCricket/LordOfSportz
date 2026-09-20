import 'dotenv/config'
import bcrypt from 'bcryptjs'
import { pool } from './db.js'

if (process.env.NODE_ENV === 'production') {
  console.error('❌ Refusing to seed test accounts in production')
  process.exit(1)
}

// Login is OTP-only (email/phone + code) since Phase 3 — these accounts'
// `password` field is vestigial (stored, never checked; the password-login
// route was removed in Phase 8). The emails themselves must be valid per
// domain/otpAuth/otp.js's identifier regex (requires a real TLD) — they
// used to be bare `@email` with no TLD, which silently made every one of
// these seeded accounts impossible to log into once OTP identifier
// validation shipped, since `/auth/send-otp` rejected them outright.
const TEST_USERS = [
  { name: 'Test Player', email: 'player@example.com', password: 'password', role: 'player', playerType: 'team_player' },
  { name: 'Test Staff', email: 'staff@example.com', password: 'password', role: 'staff', playerType: null, staffRole: 'super_admin' },
  // Umpire Login (LOC Login screen) — pre-approved so the umpire flow is
  // testable immediately, without a separate manual admin-approval step
  // each time the seed runs.
  { name: 'Test Umpire', email: 'umpire@example.com', password: 'password', role: 'player', playerType: 'umpire' },
]

async function seed() {
  for (const user of TEST_USERS) {
    const passwordHash = await bcrypt.hash(user.password, 10)
    let staffRoleId = null
    if (user.staffRole) {
      const { rows } = await pool.query('SELECT id FROM staff_roles WHERE name = $1', [user.staffRole])
      staffRoleId = rows[0]?.id || null
    }
    const { rows: userRows } = await pool.query(
      `INSERT INTO users (name, email, password_hash, role, player_type, staff_role_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (email) DO UPDATE
       SET password_hash = EXCLUDED.password_hash,
           role = EXCLUDED.role,
           player_type = EXCLUDED.player_type,
           staff_role_id = EXCLUDED.staff_role_id
       RETURNING id`,
      [user.name, user.email, passwordHash, user.role, user.playerType, staffRoleId]
    )
    console.log(`✅ Seeded ${user.role} test account: ${user.email} / ${user.password}`)

    if (user.playerType === 'umpire') {
      const userId = userRows[0].id
      const { rows: existing } = await pool.query(
        `SELECT id FROM umpire_requests WHERE user_id = $1 ORDER BY requested_at DESC LIMIT 1`,
        [userId]
      )
      if (existing[0]) {
        await pool.query(`UPDATE umpire_requests SET status = 'approved', decided_at = NOW() WHERE id = $1`, [existing[0].id])
      } else {
        await pool.query(
          `INSERT INTO umpire_requests (user_id, status, decided_at) VALUES ($1, 'approved', NOW())`,
          [userId]
        )
      }
      console.log(`✅ Test Umpire's umpire request is approved`)
    }
  }
  await pool.end()
}

seed().catch((err) => {
  console.error('❌ Seeding failed:', err.message)
  process.exit(1)
})
