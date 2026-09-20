// Account status shared by the platform directories. users.status is
// ACTIVE | INACTIVE | SUSPENDED; an unexpected value renders safely.
export function accountStatusMeta(status) {
  if (status === 'ACTIVE') return { label: 'Active', tone: 'positive' }
  if (status === 'SUSPENDED') return { label: 'Suspended', tone: 'danger' }
  if (status === 'INACTIVE') return { label: 'Inactive', tone: 'neutral' }
  return { label: status ? String(status) : 'Unknown', tone: 'neutral' }
}

// Platform staff_role (super_admin | admin | canteen_staff) — NOT ground
// staff roles. Distinct from src/utils/staffLabels.js.
const STAFF_ROLE_LABEL = { super_admin: 'Super Admin', admin: 'Admin', canteen_staff: 'Canteen Staff' }

export function adminStaffRoleLabel(staffRole) {
  return STAFF_ROLE_LABEL[staffRole] ?? (staffRole ? String(staffRole) : 'Staff')
}

export function staffRoleMeta(staffRole) {
  const tone = staffRole === 'super_admin' ? 'warn' : staffRole === 'admin' ? 'info' : 'neutral'
  return { label: adminStaffRoleLabel(staffRole), tone }
}

// A platform umpire's standing, from the latest umpire_requests row.
export function umpireStandingMeta(umpireRequestStatus) {
  if (umpireRequestStatus === 'approved') return { label: 'Approved', tone: 'positive' }
  if (umpireRequestStatus === 'rejected') return { label: 'Rejected', tone: 'danger' }
  if (umpireRequestStatus === 'pending') return { label: 'Pending', tone: 'warn' }
  return { label: 'No request', tone: 'neutral' }
}
