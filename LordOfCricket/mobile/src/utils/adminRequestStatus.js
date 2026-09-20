// Ground registration request lifecycle:
// PENDING -> UNDER_REVIEW -> APPROVED | REJECTED | MORE_INFORMATION_REQUIRED.
// Reject / request-information are only accepted server-side while the
// request is still open (PENDING or UNDER_REVIEW).
const GROUND_REQUEST_META = {
  PENDING: { label: 'Pending', tone: 'warn' },
  UNDER_REVIEW: { label: 'Under review', tone: 'info' },
  APPROVED: { label: 'Approved', tone: 'positive' },
  REJECTED: { label: 'Rejected', tone: 'danger' },
  MORE_INFORMATION_REQUIRED: { label: 'Info requested', tone: 'neutral' },
}

const OPEN_GROUND_REQUEST_STATUSES = ['PENDING', 'UNDER_REVIEW']

export function groundRequestStatusMeta(status) {
  return GROUND_REQUEST_META[status] ?? { label: status ? String(status) : 'Unknown', tone: 'neutral' }
}

export function isGroundRequestOpen(status) {
  return OPEN_GROUND_REQUEST_STATUSES.includes(status)
}

// Umpire requests list only ever returns status 'pending'; a decided one
// simply drops out of the list on refetch.
export function umpireRequestStatusMeta(status) {
  if (status === 'approved') return { label: 'Approved', tone: 'positive' }
  if (status === 'rejected') return { label: 'Rejected', tone: 'danger' }
  return { label: 'Pending', tone: 'warn' }
}
