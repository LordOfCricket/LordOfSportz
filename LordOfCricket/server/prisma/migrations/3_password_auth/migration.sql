-- Auth Enhancement — password login + forgot-password. Documents, for
-- migration history purposes, statements already applied via
-- server/src/config/schema.sql + `npm run db:migrate` (the project's single
-- actually-executed schema mechanism — see docs/DATABASE.md and
-- 2_account_creation_onboarding/migration.sql's identical framing). Not
-- executed by Prisma itself; `prisma migrate resolve --applied` marks it
-- reflected in the database.
--
-- No new tables/columns — password_hash and the sessions table already
-- existed (Phase 1/3). Only widens two existing CHECK constraints so
-- otp_codes can carry a 'PASSWORD_RESET' purpose and account_audit_log can
-- record a 'PASSWORD_RESET' event, reusing both tables exactly as they
-- already work for LOGIN/REGISTER_* purposes and every other audit event.

ALTER TABLE "otp_codes" DROP CONSTRAINT "otp_codes_purpose_check";
ALTER TABLE "otp_codes" ADD CONSTRAINT "otp_codes_purpose_check" CHECK (purpose IN ('LOGIN', 'REGISTER_PLAYER', 'REGISTER_UMPIRE', 'PASSWORD_RESET'));

ALTER TABLE "account_audit_log" DROP CONSTRAINT "account_audit_log_event_type_check";
ALTER TABLE "account_audit_log" ADD CONSTRAINT "account_audit_log_event_type_check"
  CHECK (event_type IN (
    'PLAYER_REGISTERED', 'UMPIRE_REGISTERED',
    'GROUND_OWNER_REQUEST_SUBMITTED', 'GROUND_OWNER_REQUEST_REVIEW_STARTED',
    'GROUND_OWNER_APPROVED', 'GROUND_OWNER_REJECTED', 'GROUND_OWNER_MORE_INFO_REQUESTED',
    'STAFF_CREATED', 'PERMISSION_GRANTED', 'PERMISSION_REVOKED', 'STAFF_DISABLED',
    'PASSKEY_REGISTERED', 'PASSKEY_REVOKED', 'PASSKEY_AUTHENTICATION_SUCCESS', 'PASSKEY_AUTHENTICATION_FAILURE',
    'TOTP_ENABLED', 'TOTP_DISABLED', 'TOTP_VERIFICATION_SUCCESS', 'TOTP_VERIFICATION_FAILURE',
    'MFA_ENROLLMENT_STARTED', 'MFA_ENROLLMENT_COMPLETED', 'MFA_DISABLED',
    'MFA_RECOVERY_STARTED', 'MFA_RECOVERY_COMPLETED',
    'STEP_UP_REQUESTED', 'STEP_UP_SUCCEEDED', 'STEP_UP_FAILED',
    'SESSION_REVOKED_FOR_SECURITY_REASON', 'PASSWORD_RESET'
  ));
