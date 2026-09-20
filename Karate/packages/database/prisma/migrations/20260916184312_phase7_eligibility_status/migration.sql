/*
  Warnings:

  - You are about to drop the column `isEligible` on the `eligibility_checks` table. All the data in the column will be lost.
  - Added the required column `updatedAt` to the `eligibility_checks` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "EligibilityStatus" AS ENUM ('NOT_CHECKED', 'PENDING', 'ELIGIBLE', 'INELIGIBLE', 'MANUAL_REVIEW');

-- AlterTable
ALTER TABLE "eligibility_checks" DROP COLUMN "isEligible",
ADD COLUMN     "status" "EligibilityStatus" NOT NULL DEFAULT 'NOT_CHECKED',
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;
