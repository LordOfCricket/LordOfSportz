-- AddForeignKey
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_representingAcademyId_fkey" FOREIGN KEY ("representingAcademyId") REFERENCES "academies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
