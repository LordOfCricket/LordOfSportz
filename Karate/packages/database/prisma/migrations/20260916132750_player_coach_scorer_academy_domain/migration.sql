-- CreateEnum
CREATE TYPE "ProfileStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- AlterTable
ALTER TABLE "academies" ADD COLUMN     "contactEmail" TEXT,
ADD COLUMN     "contactPhone" TEXT;

-- AlterTable: displayName added nullable first, backfilled below, then locked to NOT NULL.
-- Existing Phase 1 seed rows have no displayName yet; real users' fullName is a safe default.
ALTER TABLE "coach_profiles" ADD COLUMN     "displayName" TEXT,
ADD COLUMN     "photoUrl" TEXT,
ADD COLUMN     "status" "ProfileStatus" NOT NULL DEFAULT 'ACTIVE';

ALTER TABLE "player_profiles" ADD COLUMN     "displayName" TEXT,
ADD COLUMN     "photoUrl" TEXT,
ADD COLUMN     "status" "ProfileStatus" NOT NULL DEFAULT 'ACTIVE';

ALTER TABLE "scorer_profiles" ADD COLUMN     "displayName" TEXT,
ADD COLUMN     "photoUrl" TEXT,
ADD COLUMN     "status" "ProfileStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED';

-- Backfill from the owning user's fullName so no existing row is left invalid.
UPDATE "coach_profiles" cp SET "displayName" = u."fullName" FROM "users" u WHERE u.id = cp."userId" AND cp."displayName" IS NULL;
UPDATE "player_profiles" pp SET "displayName" = u."fullName" FROM "users" u WHERE u.id = pp."userId" AND pp."displayName" IS NULL;
UPDATE "scorer_profiles" sp SET "displayName" = u."fullName" FROM "users" u WHERE u.id = sp."userId" AND sp."displayName" IS NULL;

ALTER TABLE "coach_profiles" ALTER COLUMN "displayName" SET NOT NULL;
ALTER TABLE "player_profiles" ALTER COLUMN "displayName" SET NOT NULL;
ALTER TABLE "scorer_profiles" ALTER COLUMN "displayName" SET NOT NULL;

-- CreateTable
CREATE TABLE "_CoachStyles" (
    "A" UUID NOT NULL,
    "B" UUID NOT NULL
);

-- CreateTable
CREATE TABLE "_PlayerStyles" (
    "A" UUID NOT NULL,
    "B" UUID NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "_CoachStyles_AB_unique" ON "_CoachStyles"("A", "B");

-- CreateIndex
CREATE INDEX "_CoachStyles_B_index" ON "_CoachStyles"("B");

-- CreateIndex
CREATE UNIQUE INDEX "_PlayerStyles_AB_unique" ON "_PlayerStyles"("A", "B");

-- CreateIndex
CREATE INDEX "_PlayerStyles_B_index" ON "_PlayerStyles"("B");

-- AddForeignKey
ALTER TABLE "player_profiles" ADD CONSTRAINT "player_profiles_primaryStyleId_fkey" FOREIGN KEY ("primaryStyleId") REFERENCES "karate_styles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CoachStyles" ADD CONSTRAINT "_CoachStyles_A_fkey" FOREIGN KEY ("A") REFERENCES "coach_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CoachStyles" ADD CONSTRAINT "_CoachStyles_B_fkey" FOREIGN KEY ("B") REFERENCES "karate_styles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_PlayerStyles" ADD CONSTRAINT "_PlayerStyles_A_fkey" FOREIGN KEY ("A") REFERENCES "karate_styles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_PlayerStyles" ADD CONSTRAINT "_PlayerStyles_B_fkey" FOREIGN KEY ("B") REFERENCES "player_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Prevent duplicate ACTIVE memberships (Prisma has no declarative partial-unique-index syntax).
CREATE UNIQUE INDEX "academy_player_memberships_active_unique" ON "academy_player_memberships"("academyId", "playerId") WHERE "status" = 'ACTIVE';
CREATE UNIQUE INDEX "academy_coach_affiliations_active_unique" ON "academy_coach_affiliations"("academyId", "coachId") WHERE "status" = 'ACTIVE';

-- Prevent duplicate PENDING invitations/requests for the same academy+person.
CREATE UNIQUE INDEX "academy_membership_requests_pending_player_unique" ON "academy_membership_requests"("academyId", "playerId") WHERE "status" = 'PENDING' AND "targetType" = 'PLAYER';
CREATE UNIQUE INDEX "academy_membership_requests_pending_coach_unique" ON "academy_membership_requests"("academyId", "coachId") WHERE "status" = 'PENDING' AND "targetType" = 'COACH';
