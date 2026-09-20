// Pure helper — which GroundNavTabs entries a ground-staff member should see,
// derived from their actual backend-granted permissions/role for that ground
// (never a client-side guess). Matches the real gates in groundOwner.routes.js
// / groundOwnerBooking.routes.js / canteenMenu.routes.js exactly:
//   - Matches needs MATCH_VIEW or MATCH_MANAGE (listGroundMatches/createGroundMatch)
//   - Bookings needs BOOKING_VIEW or BOOKING_MANAGE (listGroundBookings now
//     accepts either — see groundOwnerBooking.routes.js)
//   - Canteen is role-gated, not permission-gated: GROUND_ADMIN gets the full
//     hub (menu management is GROUND_OWNER/GROUND_ADMIN only); CANTEEN_STAFF
//     can never manage the menu, so their Canteen tab skips the hub and goes
//     straight to Orders — not shown then blocked, just not shown.
export function getStaffVisibleTabLabels(membership) {
  if (!membership) return []
  const perms = membership.permissions || []
  const labels = []
  if (perms.includes('MATCH_VIEW') || perms.includes('MATCH_MANAGE')) labels.push('Matches')
  if (perms.includes('BOOKING_VIEW') || perms.includes('BOOKING_MANAGE')) labels.push('Bookings')
  if (perms.includes('PRICING_VIEW') || perms.includes('PRICING_MANAGE')) labels.push('Pricing')
  labels.push('Canteen')
  return labels
}

export function getStaffCanteenHref(membership, publicGroundId) {
  const base = `/staff/grounds/${publicGroundId}/canteen`
  return membership?.role === 'CANTEEN_STAFF' ? `${base}/orders` : base
}

// Match Permission UX — a staff member can hold MATCH_VIEW without
// MATCH_MANAGE (an Owner may grant view-only access), in which case
// createGroundMatch/startGroundMatch/completeGroundMatch/setGroundMatchUmpireFee/
// updateGroundMatchSlotPaymentStatus all correctly 403 server-side
// (groundOwner.routes.js). This is the one shared check GroundMatchesPage
// uses to hide those specific actions instead of showing them and letting
// them fail — backend authorization is unchanged, this is UI-only.
export function hasStaffPermission(membership, permissionKey) {
  return (membership?.permissions || []).includes(permissionKey)
}
