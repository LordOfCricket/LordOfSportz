import { STAFF_ROLES } from './staffPermissions'

export function staffRoleLabel(role) {
  if (role === STAFF_ROLES.GROUND_ADMIN) return 'Ground Admin'
  if (role === STAFF_ROLES.CANTEEN_STAFF) return 'Canteen Staff'
  return role || 'Staff'
}
