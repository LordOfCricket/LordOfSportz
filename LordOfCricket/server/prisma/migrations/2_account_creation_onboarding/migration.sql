-- Phase 4 — account creation & onboarding. Documents, for migration history
-- purposes, statements already applied via server/src/config/schema.sql +
-- `npm run db:migrate` (the project's single actually-executed schema
-- mechanism — see docs/DATABASE.md). Not executed by Prisma itself;
-- `prisma migrate resolve --applied` marks it reflected in the database.

ALTER TABLE "otp_codes" DROP CONSTRAINT "otp_codes_purpose_check";
ALTER TABLE "otp_codes" ADD CONSTRAINT "otp_codes_purpose_check" CHECK (purpose IN ('LOGIN', 'REGISTER_PLAYER', 'REGISTER_UMPIRE'));
ALTER TABLE "otp_codes" ADD COLUMN "metadata" JSONB;

CREATE TABLE "ground_owner_requests" (
  "id" SERIAL PRIMARY KEY,
  "public_request_id" VARCHAR(20) NOT NULL UNIQUE,
  "applicant_name" VARCHAR(100) NOT NULL,
  "applicant_email" VARCHAR(150),
  "applicant_phone" VARCHAR(20),
  "ground_name" VARCHAR(150) NOT NULL,
  "ground_description" VARCHAR(500),
  "address_line" VARCHAR(255) NOT NULL,
  "city" VARCHAR(100) NOT NULL,
  "state" VARCHAR(100) NOT NULL,
  "country" VARCHAR(100) NOT NULL DEFAULT 'India',
  "postal_code" VARCHAR(20),
  "latitude" DECIMAL(9,6),
  "longitude" DECIMAL(9,6),
  "ground_phone" VARCHAR(30) NOT NULL,
  "ground_email" VARCHAR(150),
  "ground_website" TEXT,
  "status" VARCHAR(30) NOT NULL DEFAULT 'PENDING',
  "rejection_reason" VARCHAR(500),
  "more_info_notes" VARCHAR(500),
  "reviewed_at" TIMESTAMPTZ,
  "reviewed_by" INTEGER REFERENCES "users"("id") ON DELETE SET NULL,
  "created_ground_id" INTEGER REFERENCES "grounds"("id") ON DELETE SET NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "ground_owner_requests_status_check" CHECK (status IN ('PENDING', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'MORE_INFORMATION_REQUIRED')),
  CONSTRAINT "ground_owner_requests_applicant_identifier_present" CHECK (applicant_email IS NOT NULL OR applicant_phone IS NOT NULL)
);
CREATE INDEX "idx_ground_owner_requests_status" ON "ground_owner_requests"("status", "created_at" DESC);

CREATE TABLE "account_audit_log" (
  "id" SERIAL PRIMARY KEY,
  "event_type" VARCHAR(40) NOT NULL,
  "actor_user_id" INTEGER REFERENCES "users"("id") ON DELETE SET NULL,
  "target_user_id" INTEGER REFERENCES "users"("id") ON DELETE SET NULL,
  "target_request_id" INTEGER REFERENCES "ground_owner_requests"("id") ON DELETE SET NULL,
  "metadata" JSONB,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "account_audit_log_event_type_check" CHECK (event_type IN (
    'PLAYER_REGISTERED', 'UMPIRE_REGISTERED',
    'GROUND_OWNER_REQUEST_SUBMITTED', 'GROUND_OWNER_REQUEST_REVIEW_STARTED',
    'GROUND_OWNER_APPROVED', 'GROUND_OWNER_REJECTED', 'GROUND_OWNER_MORE_INFO_REQUESTED',
    'STAFF_CREATED'
  ))
);
CREATE INDEX "idx_account_audit_log_event_type" ON "account_audit_log"("event_type", "created_at" DESC);
