-- Ground Registration feature. Documents, for migration history purposes,
-- statements already applied via server/src/config/schema.sql + `npm run
-- db:migrate` (the project's single actually-executed schema mechanism —
-- see docs/DATABASE.md and 5_player_onboarding/migration.sql's identical
-- framing). Not executed by Prisma itself; `prisma migrate resolve
-- --applied` marks it reflected in the database.
--
-- No new "registration" table — ground_owner_requests (from an earlier
-- phase) already is the registration entity; this only adds the columns/
-- tables that entity was missing: who submitted it (submitted_by_user_id,
-- for "My Ground Registrations"/resubmit ownership) and proof of terms
-- agreement (terms_agreed_at). Featured/gallery photos and amenity
-- selections are new request-scoped tables (ground_registration_photos,
-- ground_registration_amenities), copied into ground-scoped counterparts
-- (ground_photos via a new is_featured column, ground_amenities) only at
-- approval time — mirroring exactly how the request's own address/name
-- fields already get copied into a real `grounds` row only then. The
-- pre-existing `amenities` table (free-text name + owner-uploaded photo,
-- legacy/admin-only) is untouched — amenity_catalog is a new, separate,
-- LOC-controlled catalog the Ground Owner selects from instead of
-- uploading anything.

ALTER TABLE "ground_owner_requests" ADD COLUMN "submitted_by_user_id" INTEGER REFERENCES "users"("id") ON DELETE SET NULL;
ALTER TABLE "ground_owner_requests" ADD COLUMN "terms_agreed_at" TIMESTAMPTZ;

CREATE TABLE "amenity_catalog" (
  "key" VARCHAR(40) PRIMARY KEY,
  "name" VARCHAR(60) NOT NULL,
  "icon" VARCHAR(40) NOT NULL,
  "display_order" INTEGER NOT NULL DEFAULT 0,
  "is_active" BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE "ground_registration_amenities" (
  "request_id" INTEGER NOT NULL REFERENCES "ground_owner_requests"("id") ON DELETE CASCADE,
  "amenity_key" VARCHAR(40) NOT NULL REFERENCES "amenity_catalog"("key"),
  PRIMARY KEY ("request_id", "amenity_key")
);

CREATE TABLE "ground_registration_photos" (
  "id" SERIAL PRIMARY KEY,
  "request_id" INTEGER NOT NULL REFERENCES "ground_owner_requests"("id") ON DELETE CASCADE,
  "image_url" TEXT NOT NULL,
  "cloudinary_public_id" TEXT NOT NULL,
  "is_featured" BOOLEAN NOT NULL DEFAULT FALSE,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE "ground_amenities" (
  "ground_id" INTEGER NOT NULL REFERENCES "grounds"("id") ON DELETE CASCADE,
  "amenity_key" VARCHAR(40) NOT NULL REFERENCES "amenity_catalog"("key"),
  PRIMARY KEY ("ground_id", "amenity_key")
);

ALTER TABLE "ground_photos" ADD COLUMN "is_featured" BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE "otp_codes" ALTER COLUMN "purpose" TYPE VARCHAR(40);
ALTER TABLE "otp_codes" DROP CONSTRAINT "otp_codes_purpose_check";
ALTER TABLE "otp_codes" ADD CONSTRAINT "otp_codes_purpose_check" CHECK (purpose IN ('LOGIN', 'REGISTER_PLAYER', 'REGISTER_UMPIRE', 'PASSWORD_RESET', 'SIGNUP_VERIFY', 'GROUND_CONTACT_VERIFY', 'GROUND_REGISTRATION_LOOKUP'));

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
  'SESSION_REVOKED_FOR_SECURITY_REASON', 'PASSWORD_RESET', 'GROUND_OWNER_REQUEST_RESUBMITTED'
));
