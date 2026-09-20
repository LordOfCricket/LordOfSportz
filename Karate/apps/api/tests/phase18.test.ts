import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { prisma } from "@karate/database";
import { buildTestApp, createAcademyWithOrganizer, registerAndLogin } from "./helpers";
import { processFinalizedResult, getPlayerStats } from "../src/modules/stats/stats.service";
import { rebuildRanking, getRankingHistory } from "../src/modules/stats/ranking.service";
import { correctFinalizedBoutResult } from "../src/modules/bouts/bouts.service";

const app = buildTestApp();

async function fixture(discipline: "KUMITE" | "KATA" = "KUMITE") {
  const owner = await registerAndLogin(app, "ACADEMY");
  const { organizer } = await createAcademyWithOrganizer(owner.userId);
  const tournament = await prisma.tournament.create({ data: { organizerId: organizer.id, name: "Phase 18", slug: `phase18-${randomUUID()}`, createdByUserId: owner.userId, startDate: new Date(Date.now() - 86_400_000), endDate: new Date(Date.now() + 86_400_000) } });
  const category = await prisma.category.create({ data: { tournamentId: tournament.id, name: `${discipline} category` } });
  const competition = await prisma.competition.create({ data: { tournamentId: tournament.id, categoryId: category.id, discipline, name: `${discipline} competition` } });
  const users = await Promise.all([registerAndLogin(app, "PLAYER"), registerAndLogin(app, "PLAYER")]);
  const players = await Promise.all(users.map((user, index) => prisma.playerProfile.create({ data: { userId: user.userId, displayName: `Phase 18 Player ${index}`, dateOfBirth: new Date("2005-01-01"), gender: "MALE" } })));
  const draw = await prisma.draw.create({ data: { competitionId: competition.id, version: 1, bracketType: "SINGLE_ELIMINATION", generatedByUserId: owner.userId } });
  const round = await prisma.round.create({ data: { drawId: draw.id, roundNumber: 1, name: "Final" } });
  const bout = await prisma.bout.create({ data: { roundId: round.id, sequenceNumber: 1, redPlayerId: players[0]!.id, bluePlayerId: players[1]!.id, status: "FINALIZED", endedAt: new Date() } });
  const result = await prisma.boutResult.create({ data: { boutId: bout.id, winnerPlayerId: players[0]!.id, method: discipline === "KUMITE" ? "POINTS" : "DECISION", finalScoreRed: discipline === "KUMITE" ? 3 : 4, finalScoreBlue: discipline === "KUMITE" ? 1 : 2, isFinal: true } });
  return { owner, tournament, competition, bout, result, players };
}

describe("Phase 18 results, stats, and rankings", () => {
  it("processes Kumite and Kata finalized results idempotently", async () => {
    for (const discipline of ["KUMITE", "KATA"] as const) {
      const data = await fixture(discipline);
      await processFinalizedResult(data.bout.id, data.owner.userId);
      const first = await getPlayerStats(data.players[0]!.id);
      await processFinalizedResult(data.bout.id, data.owner.userId);
      const second = await getPlayerStats(data.players[0]!.id);
      expect(first.appearances).toBe(1);
      expect(first.wins).toBe(1);
      expect(second).toEqual(first);
      expect((await prisma.playerStats.findMany({ where: { playerId: data.players[0]!.id } })).length).toBe(1);
    }
  });

  it("calculates configurable ranking points, ties, and immutable snapshots", async () => {
    const data = await fixture("KUMITE");
    const season = await prisma.season.create({ data: { name: `Phase 18 ${randomUUID()}`, startDate: new Date(Date.now() - 86_400_000), endDate: new Date(Date.now() + 86_400_000) } });
    const system = await prisma.rankingSystem.create({ data: { name: `System ${randomUUID()}`, discipline: "KUMITE", strategyVersion: 2, strategy: { winPoints: 5, drawPoints: 2, lossPoints: 0 } } });
    const rankingSeason = await prisma.rankingSeason.create({ data: { rankingSystemId: system.id, seasonId: season.id } });
    const category = await prisma.rankingCategory.create({ data: { rankingSeasonId: rankingSeason.id, label: "Open" } });
    const first = await rebuildRanking(category.id);
    expect(first[0]!.points.toString()).toBe("5");
    const eventCount = await prisma.rankingPointsEvent.count({ where: { rankingCategoryId: category.id } });
    await prisma.boutResult.update({ where: { id: data.result.id }, data: { winnerPlayerId: null, method: "DRAW" } });
    const second = await rebuildRanking(category.id);
    expect(second[0]!.rank).toBe(1);
    expect(second[1]!.rank).toBe(1);
    expect(await prisma.rankingPointsEvent.count({ where: { rankingCategoryId: category.id } })).toBe(eventCount);
    expect((await getRankingHistory(category.id)).length).toBe(2);
  });

  it("requires authorized correction, preserves history, and rebuilds stats", async () => {
    const data = await fixture("KUMITE");
    const before = await prisma.boutResult.findUnique({ where: { id: data.result.id } });
    await expect(correctFinalizedBoutResult(data.bout.id, data.players[0]!.userId, { winnerPlayerId: data.players[1]!.id, correctionReason: "Official correction" })).rejects.toThrow();
    await correctFinalizedBoutResult(data.bout.id, data.owner.userId, { winnerPlayerId: data.players[1]!.id, correctionReason: "Official correction" });
    const after = await prisma.boutResult.findUnique({ where: { id: data.result.id } });
    expect(before?.winnerPlayerId).not.toBe(after?.winnerPlayerId);
    expect(await prisma.boutResultCorrection.count({ where: { boutResultId: data.result.id } })).toBe(1);
    expect((await getPlayerStats(data.players[1]!.id)).wins).toBe(1);
  });
});
