import 'dotenv/config'
import { fileURLToPath } from 'url'
import { pool } from '../config/db.js'
import { findUserByEmail } from '../models/user.model.js'
import { findGroundBySlug } from '../models/ground.model.js'
import { findActiveMembership, createMembership } from '../models/groundUser.model.js'

// Phase 9 — deliberately NOT auto-run and NOT pre-filled with a real user.
// Every staff account in the current database ("Test Staff", "Staff Two",
// "Sneaky User", teststaff@email, etc. — see the Phase 9 audit) is clearly
// test/integration-test data, not a real ground operator. Assigning
// GROUND_OWNER to one of them would be exactly the invented-placeholder
// mistake Step 16 forbids. This script is the tool to use ONCE a real
// operator's email is confirmed — it does not guess on your behalf.
//
// Usage:
//   node src/scripts/seedGroundMembership.js --email=owner@example.com --role=GROUND_OWNER [--slug=ss-cricket-ground]
//
// Idempotent: re-running with the same email+role is a no-op (returns the
// existing active membership, never a duplicate).

const VALID_ROLES = ['GROUND_OWNER', 'GROUND_ADMIN', 'CANTEEN_STAFF', 'UMPIRE', 'SCORER']

export async function seedGroundMembership({ email, role, slug = 'ss-cricket-ground' }) {
  if (!email) throw new Error('email is required')
  if (!VALID_ROLES.includes(role)) throw new Error(`role must be one of ${VALID_ROLES.join(', ')}`)

  const user = await findUserByEmail(email)
  if (!user) throw new Error(`No user found with email ${email}`)

  const ground = await findGroundBySlug(slug)
  if (!ground) throw new Error(`No ground found with slug ${slug} — run db:seed:ground first`)

  const existing = await findActiveMembership(user.id, ground.id, role)
  if (existing) {
    return { membership: existing, inserted: false, user, ground }
  }

  const membership = await createMembership({ groundId: ground.id, userId: user.id, role })
  return { membership, inserted: true, user, ground }
}

function parseArgs(argv) {
  const args = {}
  for (const arg of argv) {
    const match = /^--([^=]+)=(.*)$/.exec(arg)
    if (match) args[match[1]] = match[2]
  }
  return args
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const { membership, inserted, user, ground } = await seedGroundMembership(args)
  console.log(
    `${inserted ? '✅ Membership created' : 'ℹ Membership already existed'}: user ${user.email} (id=${user.id}) -> ${membership.role} at ground "${ground.name}" (id=${ground.id})`,
  )
}

const isMainModule = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]

if (isMainModule) {
  main()
    .catch((err) => {
      console.error('Seed script failed:', err.message)
      process.exitCode = 1
    })
    .finally(async () => {
      await pool.end()
    })
}
