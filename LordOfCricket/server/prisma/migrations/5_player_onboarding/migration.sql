-- First-Login Player Profile Onboarding. Documents, for migration history
-- purposes, statements already applied via server/src/config/schema.sql +
-- `npm run db:migrate` (the project's single actually-executed schema
-- mechanism — see docs/DATABASE.md and 4_signup_flow/migration.sql's
-- identical framing). Not executed by Prisma itself; `prisma migrate
-- resolve --applied` marks it reflected in the database.
--
-- All new columns live on the existing `players` table (one row per user
-- account via players.user_id) — no new Player/Profile table. batting_style,
-- bowling_style, jersey_number, photo_url, city, and bio already existed and
-- are reused as-is by the onboarding form; only the fields with no existing
-- home are added here. is_wicket_keeper is a real boolean, independent of
-- the pre-existing `role` playing-role enum (BATSMAN/BOWLER/ALL_ROUNDER/
-- WICKET_KEEPER/WICKET_KEEPER_BATSMAN), which this form does not touch.
-- profile_onboarding_completed is the explicit source of truth for whether
-- onboarding has been shown and handled (saved or skipped) — never inferred
-- from which optional fields happen to be filled in.

ALTER TABLE "players" ADD COLUMN "nickname" VARCHAR(50);
ALTER TABLE "players" ADD COLUMN "date_of_birth" DATE;
ALTER TABLE "players" ADD COLUMN "is_wicket_keeper" BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE "players" ADD COLUMN "address_line" VARCHAR(255);
ALTER TABLE "players" ADD COLUMN "state" VARCHAR(100);
ALTER TABLE "players" ADD COLUMN "postal_code" VARCHAR(20);
ALTER TABLE "players" ADD COLUMN "profile_onboarding_completed" BOOLEAN NOT NULL DEFAULT FALSE;
