ALTER TABLE "ranking_points_events" ADD COLUMN "sourceResultId" UUID;

CREATE UNIQUE INDEX "ranking_points_events_category_result_player_key"
ON "ranking_points_events"("rankingCategoryId", "sourceResultId", "playerId");

CREATE TABLE "ranking_snapshots" (
  "id" UUID NOT NULL,
  "rankingCategoryId" UUID NOT NULL,
  "version" INTEGER NOT NULL,
  "entries" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ranking_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ranking_snapshots_category_version_key"
ON "ranking_snapshots"("rankingCategoryId", "version");

CREATE INDEX "ranking_snapshots_category_created_idx"
ON "ranking_snapshots"("rankingCategoryId", "createdAt");

ALTER TABLE "ranking_snapshots"
ADD CONSTRAINT "ranking_snapshots_rankingCategoryId_fkey"
FOREIGN KEY ("rankingCategoryId") REFERENCES "ranking_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
