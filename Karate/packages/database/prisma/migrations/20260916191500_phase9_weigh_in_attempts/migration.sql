-- CreateEnum
CREATE TYPE "WeightUnit" AS ENUM ('KG', 'LB');

-- CreateEnum
CREATE TYPE "WeighInStatus" AS ENUM ('PENDING', 'PASSED', 'FAILED', 'REWEIGH_REQUIRED');

-- DropForeignKey
ALTER TABLE "weigh_ins" DROP CONSTRAINT "weigh_ins_registrationId_fkey";

-- AlterTable
ALTER TABLE "medical_clearances" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- DropTable
DROP TABLE "weigh_ins";

-- CreateTable
CREATE TABLE "weigh_in_attempts" (
    "id" UUID NOT NULL,
    "registrationId" UUID NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "measuredWeightKg" DECIMAL(5,2),
    "unit" "WeightUnit" NOT NULL DEFAULT 'KG',
    "status" "WeighInStatus" NOT NULL DEFAULT 'PENDING',
    "reason" TEXT,
    "verifiedByUserId" UUID,
    "measuredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "weigh_in_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "weigh_in_attempts_registrationId_idx" ON "weigh_in_attempts"("registrationId");

-- CreateIndex
CREATE UNIQUE INDEX "weigh_in_attempts_registrationId_attemptNumber_key" ON "weigh_in_attempts"("registrationId", "attemptNumber");

-- AddForeignKey
ALTER TABLE "weigh_in_attempts" ADD CONSTRAINT "weigh_in_attempts_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "registrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weigh_in_attempts" ADD CONSTRAINT "weigh_in_attempts_verifiedByUserId_fkey" FOREIGN KEY ("verifiedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
