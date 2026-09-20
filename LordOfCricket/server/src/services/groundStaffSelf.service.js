import { findMembershipsByUserId } from '../models/groundUser.model.js'
import { findGroundById } from '../models/ground.model.js'
import { findActivePermissionsForGroundUserIds } from '../models/permission.model.js'

const STAFF_ROLES = ['GROUND_ADMIN', 'CANTEEN_STAFF']

// Staff Dashboard — the read this account needs to know "which ground(s) am
// I staff at, in what role, with what permissions" is nowhere else in the
// codebase (every existing membership read is Owner-facing, keyed off a
// ground/staff list the OWNER can see, not the staff member's own). Built
// entirely from existing model functions — no new query shape.
export async function listMyStaffMemberships(userId) {
  const memberships = (await findMembershipsByUserId(userId)).filter(
    (m) => m.is_active && STAFF_ROLES.includes(m.role),
  )
  if (memberships.length === 0) return []

  const [grounds, permissionRows] = await Promise.all([
    Promise.all(memberships.map((m) => findGroundById(m.ground_id))),
    findActivePermissionsForGroundUserIds(memberships.map((m) => m.id)),
  ])

  const permissionsByMembershipId = new Map()
  for (const row of permissionRows) {
    const list = permissionsByMembershipId.get(row.ground_user_id) || []
    list.push(row.key)
    permissionsByMembershipId.set(row.ground_user_id, list)
  }

  return memberships.map((m, i) => {
    const ground = grounds[i]
    return {
      membershipId: m.id,
      groundId: m.ground_id,
      publicGroundId: ground?.public_ground_id || null,
      groundName: ground?.name || null,
      role: m.role,
      permissions: permissionsByMembershipId.get(m.id) || [],
    }
  }).filter((m) => m.publicGroundId)
}
