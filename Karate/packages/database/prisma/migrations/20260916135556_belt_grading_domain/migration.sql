/*
  Warnings:

  - Added the required column `name` to the `grading_events` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "GradingEventStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'OPEN', 'IN_PROGRESS', 'COMPLETED', 'FINALIZED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "GradingResult" AS ENUM ('PENDING', 'PASS', 'FAIL', 'ABSENT', 'WITHHELD');

-- AlterTable
ALTER TABLE "grading_events" ADD COLUMN     "name" TEXT NOT NULL,
ADD COLUMN     "status" "GradingEventStatus" NOT NULL DEFAULT 'DRAFT';

-- CreateTable
CREATE TABLE "grading_participants" (
    "id" UUID NOT NULL,
    "gradingEventId" UUID NOT NULL,
    "playerId" UUID NOT NULL,
    "previousGradeId" UUID,
    "targetGradeId" UUID NOT NULL,
    "examinerUserId" UUID,
    "result" "GradingResult" NOT NULL DEFAULT 'PENDING',
    "remarks" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decidedByUserId" UUID,
    "beltHistoryId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "grading_participants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "grading_participants_beltHistoryId_key" ON "grading_participants"("beltHistoryId");

-- CreateIndex
CREATE INDEX "grading_participants_playerId_idx" ON "grading_participants"("playerId");

-- CreateIndex
CREATE UNIQUE INDEX "grading_participants_gradingEventId_playerId_key" ON "grading_participants"("gradingEventId", "playerId");

-- AddForeignKey
ALTER TABLE "grading_participants" ADD CONSTRAINT "grading_participants_gradingEventId_fkey" FOREIGN KEY ("gradingEventId") REFERENCES "grading_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grading_participants" ADD CONSTRAINT "grading_participants_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "player_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grading_participants" ADD CONSTRAINT "grading_participants_previousGradeId_fkey" FOREIGN KEY ("previousGradeId") REFERENCES "belt_grades"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grading_participants" ADD CONSTRAINT "grading_participants_targetGradeId_fkey" FOREIGN KEY ("targetGradeId") REFERENCES "belt_grades"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grading_participants" ADD CONSTRAINT "grading_participants_beltHistoryId_fkey" FOREIGN KEY ("beltHistoryId") REFERENCES "player_belt_history"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Prevent a player from ever having two "current" belt history rows (Prisma has no declarative partial-unique-index syntax).
CREATE UNIQUE INDEX "player_belt_history_current_unique" ON "player_belt_history"("playerId") WHERE "isCurrent" = true;
