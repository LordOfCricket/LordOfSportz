import { prisma } from "@karate/database";
import { NotFoundError } from "@karate/shared";

export async function listCategories() {
  return prisma.rankingCategory.findMany({ orderBy: { label: "asc" }, include: { rankingSeason: { include: { rankingSystem: { select: { name: true, discipline: true } }, season: { select: { name: true } } } } } });
}

export async function rebuildRanking(categoryId: string) {
  const category = await prisma.rankingCategory.findUnique({ include: { rankingSeason: { include: { rankingSystem: true, season: true } } }, where: { id: categoryId } });
  if (!category) throw new NotFoundError("Ranking category", categoryId);
  const { rankingSystem, season } = category.rankingSeason;
  const strategy = (rankingSystem.strategy && typeof rankingSystem.strategy === "object" && !Array.isArray(rankingSystem.strategy) ? rankingSystem.strategy : {}) as { winPoints?: number; drawPoints?: number; lossPoints?: number };
  const winPoints = strategy.winPoints ?? 3;
  const drawPoints = strategy.drawPoints ?? 1;
  const lossPoints = strategy.lossPoints ?? 0;
  const bouts = await prisma.bout.findMany({
    where: { status: { in: ["FINISHED", "FINALIZED"] }, result: { isFinal: true }, endedAt: { gte: season.startDate, lte: season.endDate }, round: { draw: { competition: { discipline: rankingSystem.discipline } } } },
    select: { id: true, round: { select: { draw: { select: { competition: { select: { tournamentId: true } } } } } }, result: { select: { id: true, winnerPlayerId: true, finalScoreRed: true, finalScoreBlue: true } }, redPlayerId: true, bluePlayerId: true },
  });
  const points = new Map<string, number>();
  for (const bout of bouts) {
    if (!bout.result) continue;
    const winner = bout.result.winnerPlayerId;
    const rows = [bout.redPlayerId, bout.bluePlayerId].filter((id): id is string => Boolean(id));
    for (const playerId of rows) {
      const value = winner === null ? drawPoints : winner === playerId ? winPoints : lossPoints;
      points.set(playerId, (points.get(playerId) ?? 0) + value);
      await prisma.rankingPointsEvent.upsert({
        where: { rankingCategoryId_sourceResultId_playerId: { rankingCategoryId: categoryId, sourceResultId: bout.result.id, playerId } },
        create: { rankingCategoryId: categoryId, playerId, points: value, reason: winner === playerId ? "WIN" : winner === null ? "DRAW" : "LOSS", sourceTournamentId: bout.round.draw.competition.tournamentId, sourceResultId: bout.result.id },
        update: { points: value },
      });
    }
  }
  const ordered = [...points.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const ranked = ordered.map(([playerId, value], index) => ({ playerId, value, rank: index > 0 && ordered[index - 1]![1] === value ? 0 : index + 1 }));
  for (let index = 0; index < ranked.length; index += 1) if (ranked[index]!.rank === 0) ranked[index]!.rank = ranked[index - 1]!.rank;
  await prisma.$transaction(async (tx) => {
    await tx.rankingEntry.deleteMany({ where: { rankingCategoryId: categoryId } });
    if (ranked.length) await tx.rankingEntry.createMany({ data: ranked.map((entry) => ({ rankingCategoryId: categoryId, playerId: entry.playerId, points: entry.value, rank: entry.rank })) });
    const version = (await tx.rankingSnapshot.count({ where: { rankingCategoryId: categoryId } })) + 1;
    await tx.rankingSnapshot.create({ data: { rankingCategoryId: categoryId, version, entries: ranked } });
  });
  return getRanking(categoryId);
}

export async function getRanking(categoryId: string) {
  return prisma.rankingEntry.findMany({ where: { rankingCategoryId: categoryId }, orderBy: [{ rank: "asc" }, { playerId: "asc" }], include: { player: { select: { id: true, displayName: true } } } });
}

export async function getRankingHistory(categoryId: string) {
  return prisma.rankingSnapshot.findMany({ where: { rankingCategoryId: categoryId }, orderBy: { version: "desc" } });
}
