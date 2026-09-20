-- AlterEnum
BEGIN;
CREATE TYPE "MedicalClearanceStatus_new" AS ENUM ('PENDING', 'CLEARED', 'NOT_CLEARED', 'EXPIRED');
ALTER TABLE "medical_clearances" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "medical_clearances" ALTER COLUMN "status" TYPE "MedicalClearanceStatus_new" USING ("status"::text::"MedicalClearanceStatus_new");
ALTER TYPE "MedicalClearanceStatus" RENAME TO "MedicalClearanceStatus_old";
ALTER TYPE "MedicalClearanceStatus_new" RENAME TO "MedicalClearanceStatus";
DROP TYPE "MedicalClearanceStatus_old";
ALTER TABLE "medical_clearances" ALTER COLUMN "status" SET DEFAULT 'PENDING';
COMMIT;

-- AlterTable
ALTER TABLE "medical_clearances" DROP COLUMN "clearanceDocumentUrl",
DROP COLUMN "issuedAt",
DROP COLUMN "issuedByName",
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "verifiedAt" TIMESTAMP(3),
ADD COLUMN     "verifiedByUserId" UUID;

-- AddForeignKey
ALTER TABLE "medical_clearances" ADD CONSTRAINT "medical_clearances_verifiedByUserId_fkey" FOREIGN KEY ("verifiedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
