// Pure, default-deny helpers over the /me/ground-staff-memberships response.
// A membership is { membershipId, groundId, publicGroundId, groundName,
// role, permissions[] }. Role is 'GROUND_ADMIN' or 'CANTEEN_STAFF'.
// Backend authorization is always the real boundary — these only drive
// navigation and action visibility.

export const STAFF_ROLES = {
  GROUND_ADMIN: 'GROUND_ADMIN',
  CANTEEN_STAFF: 'CANTEEN_STAFF',
}

// Canteen order operations have no permission key — the backend gates them on
// role membership. Single source of truth for the client-side role gate.
export const CANTEEN_ROLES = [STAFF_ROLES.GROUND_ADMIN, STAFF_ROLES.CANTEEN_STAFF]

export function hasStaffPermission(membership, permissionKey) {
  if (!membership || !permissionKey) return false
  return Array.isArray(membership.permissions) && membership.permissions.includes(permissionKey)
}

export function isGroundAdmin(membership) {
  return membership?.role === STAFF_ROLES.GROUND_ADMIN
}

export function isCanteenStaff(membership) {
  return membership?.role === STAFF_ROLES.CANTEEN_STAFF
}
