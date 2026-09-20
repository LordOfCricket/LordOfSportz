-- CreateEnum
CREATE TYPE "VideoReviewStatus" AS ENUM ('REQUESTED', 'UPHELD', 'REJECTED', 'UNVIEWABLE');

-- AlterTable
ALTER TABLE "score_events" ADD COLUMN     "batchId" UUID,
ADD COLUMN     "sequence" SERIAL NOT NULL;

-- CreateTable
CREATE TABLE "video_review_requests" (
    "id" UUID NOT NULL,
    "boutId" UUID NOT NULL,
    "requestedByUserId" UUID NOT NULL,
    "requestedForPlayerId" UUID NOT NULL,
    "requestedScoreType" TEXT,
    "status" "VideoReviewStatus" NOT NULL DEFAULT 'REQUESTED',
    "decidedByUserId" UUID,
    "resultingEventId" UUID,
    "decisionNotes" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "video_review_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "video_review_requests_boutId_idx" ON "video_review_requests"("boutId");

-- AddForeignKey
ALTER TABLE "video_review_requests" ADD CONSTRAINT "video_review_requests_boutId_fkey" FOREIGN KEY ("boutId") REFERENCES "bouts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video_review_requests" ADD CONSTRAINT "video_review_requests_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video_review_requests" ADD CONSTRAINT "video_review_requests_decidedByUserId_fkey" FOREIGN KEY ("decidedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video_review_requests" ADD CONSTRAINT "video_review_requests_resultingEventId_fkey" FOREIGN KEY ("resultingEventId") REFERENCES "score_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

