-- AlterEnum
BEGIN;
CREATE TYPE "BoutStatus_new" AS ENUM ('SCHEDULED', 'CALLED', 'READY', 'IN_PROGRESS', 'PAUSED', 'FINISHED', 'UNDER_REVIEW', 'FINALIZED', 'CANCELLED');
ALTER TABLE "bouts" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "bouts" ALTER COLUMN "status" TYPE "BoutStatus_new" USING ("status"::text::"BoutStatus_new");
ALTER TYPE "BoutStatus" RENAME TO "BoutStatus_old";
ALTER TYPE "BoutStatus_new" RENAME TO "BoutStatus";
DROP TYPE "BoutStatus_old";
ALTER TABLE "bouts" ALTER COLUMN "status" SET DEFAULT 'SCHEDULED';
COMMIT;

-- AlterTable
ALTER TABLE "bout_results" ADD COLUMN     "reason" TEXT;

-- AlterTable
ALTER TABLE "bouts" ADD COLUMN     "cancelReason" TEXT;
