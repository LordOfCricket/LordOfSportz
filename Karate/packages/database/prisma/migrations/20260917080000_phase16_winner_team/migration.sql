-- AlterTable
ALTER TABLE "bout_results" ADD COLUMN     "winnerTeamId" UUID;

-- AddForeignKey
ALTER TABLE "bout_results" ADD CONSTRAINT "bout_results_winnerTeamId_fkey" FOREIGN KEY ("winnerTeamId") REFERENCES "kata_teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

