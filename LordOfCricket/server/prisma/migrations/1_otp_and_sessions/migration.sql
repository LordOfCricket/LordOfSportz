-- Phase 3 — unified OTP authentication. This file documents, for migration
-- history purposes, the exact statements already applied to the database
-- via server/src/config/schema.sql + `npm run db:migrate` (the project's
-- single, actually-executed schema mechanism — see docs/DATABASE.md). This
-- file itself is not executed; `prisma migrate resolve --applied` marks it
-- as already reflected in the database, matching Phase 2A's baselining
-- approach for the same reason: schema.sql remains the one source of truth
-- that actually runs DDL, avoiding two systems that could both apply
-- changes to the same database.

ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL;
ALTER TABLE "users" ALTER COLUMN "password_hash" DROP NOT NULL;
ALTER TABLE "users" ADD COLUMN "phone" VARCHAR(20);
ALTER TABLE "users" ADD CONSTRAINT "users_phone_key" UNIQUE ("phone");
ALTER TABLE "users" ADD CONSTRAINT "users_email_or_phone_present" CHECK (email IS NOT NULL OR phone IS NOT NULL);
ALTER TABLE "users" ADD COLUMN "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "users" ADD CONSTRAINT "users_status_check" CHECK (status IN ('ACTIVE', 'SUSPENDED', 'DISABLED', 'PENDING'));

CREATE TABLE "otp_codes" (
  "id" BIGSERIAL PRIMARY KEY,
  "identifier" VARCHAR(150) NOT NULL,
  "identifier_type" VARCHAR(10) NOT NULL,
  "purpose" VARCHAR(20) NOT NULL DEFAULT 'LOGIN',
  "provider" VARCHAR(20) NOT NULL DEFAULT 'CONSOLE',
  "otp_hash" TEXT,
  "status" VARCHAR(10) NOT NULL DEFAULT 'PENDING',
  "attempts" SMALLINT NOT NULL DEFAULT 0,
  "max_attempts" SMALLINT NOT NULL DEFAULT 5,
  "expires_at" TIMESTAMPTZ NOT NULL,
  "verified_at" TIMESTAMPTZ,
  "user_id" INTEGER REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "otp_codes_identifier_type_check" CHECK (identifier_type IN ('EMAIL', 'PHONE')),
  CONSTRAINT "otp_codes_purpose_check" CHECK (purpose IN ('LOGIN')),
  CONSTRAINT "otp_codes_provider_check" CHECK (provider IN ('CONSOLE', 'TWILIO_VERIFY', 'SENDGRID')),
  CONSTRAINT "otp_codes_status_check" CHECK (status IN ('PENDING', 'VERIFIED', 'EXPIRED', 'LOCKED'))
);
CREATE INDEX "idx_otp_codes_identifier_purpose_pending" ON "otp_codes"("identifier", "purpose") WHERE status = 'PENDING';
CREATE INDEX "idx_otp_codes_identifier_created" ON "otp_codes"("identifier", "created_at");

CREATE TABLE "sessions" (
  "id" BIGSERIAL PRIMARY KEY,
  "user_id" INTEGER NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "token_hash" VARCHAR(64) NOT NULL UNIQUE,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "expires_at" TIMESTAMPTZ NOT NULL,
  "revoked_at" TIMESTAMPTZ,
  "last_used_at" TIMESTAMPTZ,
  "ip_address" VARCHAR(45),
  "user_agent" TEXT
);
CREATE INDEX "idx_sessions_user_id" ON "sessions"("user_id");
