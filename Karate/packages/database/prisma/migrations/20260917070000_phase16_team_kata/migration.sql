-- CreateEnum
CREATE TYPE "KataEvaluationPhase" AS ENUM ('KATA', 'BUNKAI');

-- CreateEnum
CREATE TYPE "KataTeamStatus" AS ENUM ('ACTIVE', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "KataTeamMemberStatus" AS ENUM ('ACTIVE', 'REMOVED');

-- AlterTable
ALTER TABLE "bouts" ADD COLUMN     "blueTeamId" UUID,
ADD COLUMN     "redTeamId" UUID;

-- AlterTable
ALTER TABLE "judge_evaluations" ADD COLUMN     "phase" "KataEvaluationPhase" NOT NULL DEFAULT 'KATA',
ADD COLUMN     "targetTeamId" UUID,
ALTER COLUMN "targetPlayerId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "kata_performances" ADD COLUMN     "bunkaiRequired" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "kata_teams" (
    "id" UUID NOT NULL,
    "academyId" UUID NOT NULL,
    "competitionId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "status" "KataTeamStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kata_teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kata_team_members" (
    "id" UUID NOT NULL,
    "teamId" UUID NOT NULL,
    "playerId" UUID NOT NULL,
    "status" "KataTeamMemberStatus" NOT NULL DEFAULT 'ACTIVE',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kata_team_members_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "kata_teams_competitionId_name_key" ON "kata_teams"("competitionId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "kata_team_members_teamId_playerId_key" ON "kata_team_members"("teamId", "playerId");

-- AddForeignKey
ALTER TABLE "bouts" ADD CONSTRAINT "bouts_redTeamId_fkey" FOREIGN KEY ("redTeamId") REFERENCES "kata_teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bouts" ADD CONSTRAINT "bouts_blueTeamId_fkey" FOREIGN KEY ("blueTeamId") REFERENCES "kata_teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "judge_evaluations" ADD CONSTRAINT "judge_evaluations_targetTeamId_fkey" FOREIGN KEY ("targetTeamId") REFERENCES "kata_teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kata_teams" ADD CONSTRAINT "kata_teams_academyId_fkey" FOREIGN KEY ("academyId") REFERENCES "academies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kata_teams" ADD CONSTRAINT "kata_teams_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "competitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kata_team_members" ADD CONSTRAINT "kata_team_members_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "kata_teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kata_team_members" ADD CONSTRAINT "kata_team_members_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "player_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

