ALTER TABLE "ranking_systems" ADD COLUMN "strategyVersion" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "ranking_systems" ADD COLUMN "strategy" JSONB;

CREATE TABLE "bout_result_corrections" (
  "id" UUID NOT NULL,
  "boutResultId" UUID NOT NULL,
  "correctedByUserId" UUID NOT NULL,
  "reason" TEXT NOT NULL,
  "previousValue" JSONB NOT NULL,
  "correctedValue" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "bout_result_corrections_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "bout_result_corrections_result_created_idx" ON "bout_result_corrections"("boutResultId", "createdAt");
ALTER TABLE "bout_result_corrections" ADD CONSTRAINT "bout_result_corrections_result_fkey" FOREIGN KEY ("boutResultId") REFERENCES "bout_results"("id") ON DELETE CASCADE ON UPDATE CASCADE;
