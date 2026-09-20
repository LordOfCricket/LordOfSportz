// Mirrors the backend's ACCOUNT_AUDIT_EVENTS names
// (server/src/services/accountAudit.service.js) as filter options — the same
// deliberate client-side duplication the web audit page uses. A plain list
// of existing event-name strings, not a second taxonomy.
export const AUDIT_EVENT_TYPES = [
  'PLAYER_REGISTERED',
  'UMPIRE_REGISTERED',
  'GROUND_OWNER_REQUEST_SUBMITTED',
  'GROUND_OWNER_REQUEST_REVIEW_STARTED',
  'GROUND_OWNER_APPROVED',
  'GROUND_OWNER_REJECTED',
  'GROUND_OWNER_MORE_INFO_REQUESTED',
  'GROUND_OWNER_REQUEST_RESUBMITTED',
  'STAFF_CREATED',
  'PERMISSION_GRANTED',
  'PERMISSION_REVOKED',
  'STAFF_DISABLED',
  'PASSKEY_REGISTERED',
  'PASSKEY_REVOKED',
  'PASSKEY_AUTHENTICATION_SUCCESS',
  'PASSKEY_AUTHENTICATION_FAILURE',
  'TOTP_ENABLED',
  'TOTP_DISABLED',
  'TOTP_VERIFICATION_SUCCESS',
  'TOTP_VERIFICATION_FAILURE',
  'MFA_ENROLLMENT_STARTED',
  'MFA_ENROLLMENT_COMPLETED',
  'MFA_DISABLED',
  'MFA_RECOVERY_STARTED',
  'MFA_RECOVERY_COMPLETED',
  'STEP_UP_REQUESTED',
  'STEP_UP_SUCCEEDED',
  'STEP_UP_FAILED',
  'SESSION_REVOKED_FOR_SECURITY_REASON',
  'PASSWORD_RESET',
  'SUPER_ADMIN_BOOTSTRAPPED',
  'ADMIN_LOGIN',
  'PASSWORD_CHANGED',
  'GROUND_SUSPENDED',
  'GROUND_REACTIVATED',
  'ACCOUNT_STATUS_CHANGED',
  'PASSWORD_RESET_INITIATED_BY_ADMIN',
  'TEMPORARY_CREDENTIAL_GENERATED',
  'TEMPORARY_CREDENTIAL_USED',
]

export function eventTypeLabel(type) {
  if (!type) return 'All events'
  return String(type).replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase())
}

// Only these metadata keys are ever surfaced — a strict allowlist, string
// values only, never a JSON dump. Everything else in metadata is ignored.
const SAFE_METADATA_KEYS = {
  reason: 'Reason',
  notes: 'Notes',
  groundName: 'Ground',
  groundPublicId: 'Ground ID',
}

export function safeMetadataLines(metadata) {
  if (!metadata || typeof metadata !== 'object') return []
  return Object.entries(SAFE_METADATA_KEYS)
    .filter(([k]) => typeof metadata[k] === 'string' && metadata[k].trim())
    .map(([k, label]) => `${label}: ${metadata[k].slice(0, 160)}`)
}
