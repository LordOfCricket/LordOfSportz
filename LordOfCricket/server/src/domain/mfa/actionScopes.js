// Phase 6 — the closed set of step-up-gated actions, mirroring
// step_up_grants.action_scope's CHECK constraint exactly. Validated here
// BEFORE any DB write (matches this codebase's established
// validate-before-insert convention, e.g. groundStaff.service.js's role
// check) so an unrecognized scope 400s cleanly instead of surfacing as a
// raw constraint-violation error.
export const STEP_UP_ACTION_SCOPES = Object.freeze([
  'WEBAUTHN_ADD',
  'WEBAUTHN_REMOVE',
  'TOTP_ENABLE',
  'TOTP_DISABLE',
  'RECOVERY_CODES_REGENERATE',
  'MFA_DISABLE',
  'STAFF_CREATE',
  'GROUND_OWNER_REQUEST_APPROVE',
  'PERMISSION_GRANT',
  'STAFF_DISABLE',
])

export function isValidActionScope(scope) {
  return STEP_UP_ACTION_SCOPES.includes(scope)
}
