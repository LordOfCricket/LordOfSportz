// Ground lifecycle for the Super Admin oversight screens. The backend enum
// is DRAFT | ACTIVE | SUSPENDED; only ACTIVE<->SUSPENDED transitions are
// exposed here. An unknown status renders safely rather than crashing.
const META = {
  ACTIVE: { label: 'Active', tone: 'positive' },
  SUSPENDED: { label: 'Suspended', tone: 'danger' },
  DRAFT: { label: 'Draft', tone: 'neutral' },
}

export function groundStatusMeta(status) {
  return META[status] ?? { label: status ? String(status) : 'Unknown', tone: 'neutral' }
}

export function canSuspend(status) {
  return status === 'ACTIVE'
}

export function canReactivate(status) {
  return status === 'SUSPENDED'
}
