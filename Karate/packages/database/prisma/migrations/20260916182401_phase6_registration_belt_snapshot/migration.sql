-- AlterTable
ALTER TABLE "registrations" ADD COLUMN     "beltGradeIdAtRegistration" UUID;

-- CreateIndex
CREATE INDEX "registrations_playerId_idx" ON "registrations"("playerId");

-- CreateIndex
CREATE INDEX "registrations_representingAcademyId_idx" ON "registrations"("representingAcademyId");

-- AddForeignKey
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_beltGradeIdAtRegistration_fkey" FOREIGN KEY ("beltGradeIdAtRegistration") REFERENCES "belt_grades"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
