-- SUPER_ADMIN Identity, Secure Provisioning & Admin Control Center.
-- Documents, for migration history purposes, statements already applied
-- via server/src/config/schema.sql + `npm run db:migrate` (the project's
-- single actually-executed schema mechanism — see docs/DATABASE.md and
-- 6_ground_registration/migration.sql's identical framing). Not executed
-- by Prisma itself; `prisma migrate resolve --applied` marks it reflected
-- in the database.
--
-- No new tables — reuses the existing users/staff_roles/account_audit_log/
-- step_up_grants architecture entirely. `staff_id` (already existed) is
-- reused as the "Admin ID" (LOC-ADM-001 format, see utils/adminId.js) —
-- not duplicated. `username` is new and purely display/reference, never a
-- login credential (see the inline comment on it in schema.sql for why).
-- `force_password_change`/`temp_password_hash`/`temp_password_expires_at`
-- back the bootstrap-forces-password-change requirement and the new
-- admin-initiated temporary-credential password recovery flow.

ALTER TABLE "users" ADD COLUMN "username" VARCHAR(50) UNIQUE;
ALTER TABLE "users" ADD COLUMN "force_password_change" BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE "users" ADD COLUMN "temp_password_hash" TEXT;
ALTER TABLE "users" ADD COLUMN "temp_password_expires_at" TIMESTAMPTZ;
ALTER TABLE "users" ADD COLUMN "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE "account_audit_log" DROP CONSTRAINT "account_audit_log_event_type_check";
ALTER TABLE "account_audit_log" ADD CONSTRAINT "account_audit_log_event_type_check" CHECK (event_type IN (
  'PLAYER_REGISTERED', 'UMPIRE_REGISTERED',
  'GROUND_OWNER_REQUEST_SUBMITTED', 'GROUND_OWNER_REQUEST_REVIEW_STARTED',
  'GROUND_OWNER_APPROVED', 'GROUND_OWNER_REJECTED', 'GROUND_OWNER_MORE_INFO_REQUESTED',
  'STAFF_CREATED', 'PERMISSION_GRANTED', 'PERMISSION_REVOKED', 'STAFF_DISABLED',
  'PASSKEY_REGISTERED', 'PASSKEY_REVOKED', 'PASSKEY_AUTHENTICATION_SUCCESS', 'PASSKEY_AUTHENTICATION_FAILURE',
  'TOTP_ENABLED', 'TOTP_DISABLED', 'TOTP_VERIFICATION_SUCCESS', 'TOTP_VERIFICATION_FAILURE',
  'MFA_ENROLLMENT_STARTED', 'MFA_ENROLLMENT_COMPLETED', 'MFA_DISABLED',
  'MFA_RECOVERY_STARTED', 'MFA_RECOVERY_COMPLETED',
  'STEP_UP_REQUESTED', 'STEP_UP_SUCCEEDED', 'STEP_UP_FAILED',
  'SESSION_REVOKED_FOR_SECURITY_REASON', 'PASSWORD_RESET', 'GROUND_OWNER_REQUEST_RESUBMITTED',
  'SUPER_ADMIN_BOOTSTRAPPED', 'ADMIN_LOGIN', 'PASSWORD_CHANGED',
  'GROUND_SUSPENDED', 'GROUND_REACTIVATED', 'ACCOUNT_STATUS_CHANGED',
  'PASSWORD_RESET_INITIATED_BY_ADMIN', 'TEMPORARY_CREDENTIAL_GENERATED', 'TEMPORARY_CREDENTIAL_USED'
));

ALTER TABLE "step_up_grants" DROP CONSTRAINT "step_up_grants_action_scope_check";
ALTER TABLE "step_up_grants" ADD CONSTRAINT "step_up_grants_action_scope_check" CHECK (action_scope IN (
  'WEBAUTHN_ADD', 'WEBAUTHN_REMOVE', 'TOTP_ENABLE', 'TOTP_DISABLE',
  'RECOVERY_CODES_REGENERATE', 'MFA_DISABLE',
  'STAFF_CREATE', 'GROUND_OWNER_REQUEST_APPROVE', 'PERMISSION_GRANT', 'STAFF_DISABLE',
  'ADMIN_PASSWORD_RESET'
));
