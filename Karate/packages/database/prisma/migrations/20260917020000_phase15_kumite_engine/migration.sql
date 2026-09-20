-- AlterTable
ALTER TABLE "bouts" ADD COLUMN     "clockElapsedSeconds" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "clockLastStartedAt" TIMESTAMP(3),
ADD COLUMN     "clockRunning" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "score_events" ADD COLUMN     "reversesEventId" UUID;

-- CreateTable
CREATE TABLE "kumite_configurations" (
    "id" UUID NOT NULL,
    "ruleSetVersionId" UUID NOT NULL,
    "yukoPoints" INTEGER NOT NULL DEFAULT 1,
    "wazaAriPoints" INTEGER NOT NULL DEFAULT 2,
    "ipponPoints" INTEGER NOT NULL DEFAULT 3,
    "clearLeadPoints" INTEGER NOT NULL DEFAULT 8,
    "senshuEnabled" BOOLEAN NOT NULL DEFAULT true,
    "chuiLimit" INTEGER NOT NULL DEFAULT 3,
    "passivityProtectedSeconds" INTEGER NOT NULL DEFAULT 15,
    "videoReviewEnabled" BOOLEAN NOT NULL DEFAULT false,
    "twoJudgeMode" BOOLEAN NOT NULL DEFAULT false,
    "panelJudgeCount" INTEGER NOT NULL DEFAULT 4,

    CONSTRAINT "kumite_configurations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "kumite_configurations_ruleSetVersionId_key" ON "kumite_configurations"("ruleSetVersionId");

-- AddForeignKey
ALTER TABLE "score_events" ADD CONSTRAINT "score_events_reversesEventId_fkey" FOREIGN KEY ("reversesEventId") REFERENCES "score_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kumite_configurations" ADD CONSTRAINT "kumite_configurations_ruleSetVersionId_fkey" FOREIGN KEY ("ruleSetVersionId") REFERENCES "rule_set_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

