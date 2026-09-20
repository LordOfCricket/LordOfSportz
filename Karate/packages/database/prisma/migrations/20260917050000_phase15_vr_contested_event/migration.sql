-- AlterTable
ALTER TABLE "video_review_requests" ADD COLUMN     "contestedEventId" UUID;

-- AddForeignKey
ALTER TABLE "video_review_requests" ADD CONSTRAINT "video_review_requests_contestedEventId_fkey" FOREIGN KEY ("contestedEventId") REFERENCES "score_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

