-- CreateEnum
CREATE TYPE "SeedSource" AS ENUM ('MANUAL', 'RANKING', 'RANDOM', 'NONE');

-- CreateEnum
CREATE TYPE "ScheduleStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'IN_PROGRESS', 'DELAYED', 'COMPLETED', 'CANCELLED');

-- AlterEnum
ALTER TYPE "TatamiStatus" ADD VALUE 'MAINTENANCE';

-- AlterTable
ALTER TABLE "categories" ADD COLUMN     "estimatedBoutDurationMinutes" INTEGER;

-- AlterTable
ALTER TABLE "draws" ADD COLUMN     "seedingStrategy" "SeedSource" NOT NULL DEFAULT 'NONE';

-- AlterTable
ALTER TABLE "official_assignments" ADD COLUMN     "competitionId" UUID,
ADD COLUMN     "endAt" TIMESTAMP(3),
ADD COLUMN     "startAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "draw_seeds" (
    "id" UUID NOT NULL,
    "drawId" UUID NOT NULL,
    "registrationId" UUID NOT NULL,
    "playerId" UUID NOT NULL,
    "seedNumber" INTEGER,
    "seedSource" "SeedSource" NOT NULL DEFAULT 'NONE',
    "position" INTEGER NOT NULL,

    CONSTRAINT "draw_seeds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schedules" (
    "id" UUID NOT NULL,
    "tournamentId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "ScheduleStatus" NOT NULL DEFAULT 'DRAFT',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "delayMinutes" INTEGER NOT NULL DEFAULT 0,
    "generatedByUserId" UUID NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,

    CONSTRAINT "schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bout_schedules" (
    "id" UUID NOT NULL,
    "scheduleId" UUID NOT NULL,
    "boutId" UUID NOT NULL,
    "tatamiId" UUID,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "estimatedDurationMinutes" INTEGER NOT NULL,
    "sequenceOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bout_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "draw_seeds_drawId_registrationId_key" ON "draw_seeds"("drawId", "registrationId");

-- CreateIndex
CREATE UNIQUE INDEX "draw_seeds_drawId_position_key" ON "draw_seeds"("drawId", "position");

-- CreateIndex
CREATE INDEX "schedules_tournamentId_isActive_idx" ON "schedules"("tournamentId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "schedules_tournamentId_version_key" ON "schedules"("tournamentId", "version");

-- CreateIndex
CREATE INDEX "bout_schedules_boutId_idx" ON "bout_schedules"("boutId");

-- CreateIndex
CREATE INDEX "bout_schedules_scheduleId_tatamiId_sequenceOrder_idx" ON "bout_schedules"("scheduleId", "tatamiId", "sequenceOrder");

-- CreateIndex
CREATE UNIQUE INDEX "bout_schedules_scheduleId_boutId_key" ON "bout_schedules"("scheduleId", "boutId");

-- AddForeignKey
ALTER TABLE "draw_seeds" ADD CONSTRAINT "draw_seeds_drawId_fkey" FOREIGN KEY ("drawId") REFERENCES "draws"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "draw_seeds" ADD CONSTRAINT "draw_seeds_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "registrations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "draw_seeds" ADD CONSTRAINT "draw_seeds_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "player_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "official_assignments" ADD CONSTRAINT "official_assignments_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "competitions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bout_schedules" ADD CONSTRAINT "bout_schedules_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bout_schedules" ADD CONSTRAINT "bout_schedules_boutId_fkey" FOREIGN KEY ("boutId") REFERENCES "bouts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bout_schedules" ADD CONSTRAINT "bout_schedules_tatamiId_fkey" FOREIGN KEY ("tatamiId") REFERENCES "tatamis"("id") ON DELETE SET NULL ON UPDATE CASCADE;
