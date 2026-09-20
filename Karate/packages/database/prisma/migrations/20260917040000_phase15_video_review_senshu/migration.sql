-- AlterTable
ALTER TABLE "score_events" ADD COLUMN     "simultaneousWithEventId" UUID;

-- AddForeignKey
ALTER TABLE "score_events" ADD CONSTRAINT "score_events_simultaneousWithEventId_fkey" FOREIGN KEY ("simultaneousWithEventId") REFERENCES "score_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

