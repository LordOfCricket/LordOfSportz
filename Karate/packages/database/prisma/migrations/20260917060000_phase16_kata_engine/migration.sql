-- CreateTable
CREATE TABLE "kata_definitions" (
    "id" UUID NOT NULL,
    "ruleSetVersionId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "styleNote" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kata_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kata_configurations" (
    "id" UUID NOT NULL,
    "ruleSetVersionId" UUID NOT NULL,
    "panelSizeElimination" INTEGER NOT NULL DEFAULT 5,
    "panelSizeRoundRobin" INTEGER NOT NULL DEFAULT 7,
    "scoreMin" DECIMAL(3,1) NOT NULL DEFAULT 5.0,
    "scoreMax" DECIMAL(3,1) NOT NULL DEFAULT 10.0,
    "scoreIncrement" DECIMAL(3,1) NOT NULL DEFAULT 0.1,
    "maxKataRepeats" INTEGER NOT NULL DEFAULT 2,
    "kikenVotes" INTEGER NOT NULL DEFAULT 4,

    CONSTRAINT "kata_configurations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kata_performances" (
    "id" UUID NOT NULL,
    "boutId" UUID NOT NULL,
    "redKataDefinitionId" UUID,
    "blueKataDefinitionId" UUID,
    "redAnnouncedAt" TIMESTAMP(3),
    "blueAnnouncedAt" TIMESTAMP(3),

    CONSTRAINT "kata_performances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "judge_evaluations" (
    "id" UUID NOT NULL,
    "kataPerformanceId" UUID NOT NULL,
    "officialAssignmentId" UUID NOT NULL,
    "targetPlayerId" UUID NOT NULL,
    "score" DECIMAL(3,1),
    "isDisqualification" BOOLEAN NOT NULL DEFAULT false,
    "sequence" SERIAL NOT NULL,
    "correctionOfId" UUID,
    "clientOperationId" TEXT,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "judge_evaluations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "kata_definitions_ruleSetVersionId_name_key" ON "kata_definitions"("ruleSetVersionId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "kata_configurations_ruleSetVersionId_key" ON "kata_configurations"("ruleSetVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "kata_performances_boutId_key" ON "kata_performances"("boutId");

-- CreateIndex
CREATE UNIQUE INDEX "judge_evaluations_clientOperationId_key" ON "judge_evaluations"("clientOperationId");

-- CreateIndex
CREATE INDEX "judge_evaluations_kataPerformanceId_sequence_idx" ON "judge_evaluations"("kataPerformanceId", "sequence");

-- AddForeignKey
ALTER TABLE "kata_definitions" ADD CONSTRAINT "kata_definitions_ruleSetVersionId_fkey" FOREIGN KEY ("ruleSetVersionId") REFERENCES "rule_set_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kata_configurations" ADD CONSTRAINT "kata_configurations_ruleSetVersionId_fkey" FOREIGN KEY ("ruleSetVersionId") REFERENCES "rule_set_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kata_performances" ADD CONSTRAINT "kata_performances_boutId_fkey" FOREIGN KEY ("boutId") REFERENCES "bouts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kata_performances" ADD CONSTRAINT "kata_performances_redKataDefinitionId_fkey" FOREIGN KEY ("redKataDefinitionId") REFERENCES "kata_definitions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kata_performances" ADD CONSTRAINT "kata_performances_blueKataDefinitionId_fkey" FOREIGN KEY ("blueKataDefinitionId") REFERENCES "kata_definitions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "judge_evaluations" ADD CONSTRAINT "judge_evaluations_kataPerformanceId_fkey" FOREIGN KEY ("kataPerformanceId") REFERENCES "kata_performances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "judge_evaluations" ADD CONSTRAINT "judge_evaluations_officialAssignmentId_fkey" FOREIGN KEY ("officialAssignmentId") REFERENCES "official_assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "judge_evaluations" ADD CONSTRAINT "judge_evaluations_correctionOfId_fkey" FOREIGN KEY ("correctionOfId") REFERENCES "judge_evaluations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

