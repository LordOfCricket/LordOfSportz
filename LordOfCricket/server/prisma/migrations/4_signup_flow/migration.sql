-- New Signup Flow. Documents, for migration history purposes, statements
-- already applied via server/src/config/schema.sql + `npm run db:migrate`
-- (the project's single actually-executed schema mechanism — see
-- docs/DATABASE.md and 2_account_creation_onboarding/migration.sql's
-- identical framing). Not executed by Prisma itself; `prisma migrate
-- resolve --applied` marks it reflected in the database.
--
-- No new tables/columns. First/middle/last name are combined into the
-- existing users.name column at the application layer (no schema change —
-- 67+ call sites across the app already depend on user.name being one
-- string). Account type (Player/Umpire) maps to the existing role='player'
-- + player_type representation, not new role strings. Email/phone
-- verification proof lives in otp_codes (existing table) via the new
-- purpose below, checked at account-creation time — no emailVerified/
-- phoneVerified columns needed since an account created by this flow is
-- never persisted until both are already OTP-verified, matching the same
-- implicit guarantee every prior OTP-based signup path already provides.

ALTER TABLE "otp_codes" DROP CONSTRAINT "otp_codes_purpose_check";
ALTER TABLE "otp_codes" ADD CONSTRAINT "otp_codes_purpose_check" CHECK (purpose IN ('LOGIN', 'REGISTER_PLAYER', 'REGISTER_UMPIRE', 'PASSWORD_RESET', 'SIGNUP_VERIFY'));
