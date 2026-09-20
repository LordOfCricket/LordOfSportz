import { prisma } from "@karate/database";
import { AuthorizationError, NotFoundError } from "@karate/shared";
import { rebuildRanking } from "./ranking.service";
import { createNotification } from "../notifications/notifications.service";

const FINAL_RESULT = { isFinal: true } as const;

type FinalBout = {
  id: string;
  endedAt: Date | null;
  redPlayerId: string | null;
  bluePlayerId: string | null;
  redPlayer: { id: string; displayName: string } | null;
  bluePlayer: { id: string; displayName: string } | null;
  result: { id: string; winnerPlayerId: string | null; method: string; finalScoreRed: number | null; finalScoreBlue: number | null; decidedAt: Date } | null;
  round: { draw: { competition: { discipline: "KUMITE" | "KATA"; tournamentId: string; tournament: { id: string; name: string; startDate: Date | null; endDate: Date | null } } } };
};
type PlayerAggregate = { playerId: string; appearances: number; wins: number; losses: number; draws: number; pointsScored: number; pointsConceded: number; resultMethods: Record<string, number>; kumiteBouts: number; kataBouts: number; tournaments: Set<string> };

async function finalBouts(where: object = {}): Promise<FinalBout[]> {
  return prisma.bout.findMany({
    where: { ...where, status: { in: ["FINISHED", "FINALIZED"] }, result: FINAL_RESULT },
    include: {
      redPlayer: { select: { id: true, displayName: true } },
      bluePlayer: { select: { id: true, displayName: true } },
      result: { select: { id: true, winnerPlayerId: true, method: true, finalScoreRed: true, finalScoreBlue: true, decidedAt: true } },
      round: { select: { draw: { select: { competition: { select: { discipline: true, tournamentId: true, tournament: { select: { id: true, name: true, startDate: true, endDate: true } } } } } } } },
    },
    orderBy: { endedAt: "asc" },
  }) as unknown as FinalBout[];
}

function seasonMatch(bout: FinalBout, season: { startDate: Date; endDate: Date } | null) {
  if (!season) return true;
  const date = bout.result?.decidedAt ?? bout.endedAt;
  return Boolean(date && date >= season.startDate && date <= season.endDate);
}

function addPlayer(map: Map<string, PlayerAggregate>, playerId: string, bout: FinalBout, side: "red" | "blue") {
  const result = bout.result!;
  const row = map.get(playerId) ?? { playerId, appearances: 0, wins: 0, losses: 0, draws: 0, pointsScored: 0, pointsConceded: 0, resultMethods: {}, kumiteBouts: 0, kataBouts: 0, tournaments: new Set<string>() };
  row.appearances += 1;
  if (result.winnerPlayerId === playerId) row.wins += 1;
  else if (result.winnerPlayerId === null) row.draws += 1;
  else row.losses += 1;
  row.pointsScored += side === "red" ? result.finalScoreRed ?? 0 : result.finalScoreBlue ?? 0;
  row.pointsConceded += side === "red" ? result.finalScoreBlue ?? 0 : result.finalScoreRed ?? 0;
  row.resultMethods[result.method] = (row.resultMethods[result.method] ?? 0) + 1;
  if (bout.round.draw.competition.discipline === "KUMITE") row.kumiteBouts += 1;
  else row.kataBouts += 1;
  row.tournaments.add(bout.round.draw.competition.tournamentId);
  map.set(playerId, row);
}

function serialize(row: PlayerAggregate) {
  return { ...row, winRate: row.appearances ? row.wins / row.appearances : 0, tournamentsEntered: row.tournaments.size, resultMethods: row.resultMethods, tournaments: undefined };
}

export async function getPlayerResults(playerId: string) {
  const bouts = await finalBouts({ OR: [{ redPlayerId: playerId }, { bluePlayerId: playerId }] });
  return bouts.map((bout) => ({ boutId: bout.id, playerId, tournament: bout.round.draw.competition.tournament, discipline: bout.round.draw.competition.discipline, opponent: bout.redPlayerId === playerId ? bout.bluePlayer : bout.redPlayer, side: bout.redPlayerId === playerId ? "RED" : "BLUE", result: bout.result, date: bout.result?.decidedAt ?? bout.endedAt }));
}

export async function getPlayerStats(playerId: string, seasonId?: string) {
  const season = seasonId ? await prisma.season.findUnique({ where: { id: seasonId }, select: { startDate: true, endDate: true } }) : null;
  if (seasonId && !season) throw new NotFoundError("Season", seasonId);
  const map = new Map<string, PlayerAggregate>();
  for (const bout of await finalBouts({ OR: [{ redPlayerId: playerId }, { bluePlayerId: playerId }] })) {
    if (seasonMatch(bout, season)) addPlayer(map, playerId, bout, bout.redPlayerId === playerId ? "red" : "blue");
  }
  return serialize(map.get(playerId) ?? { playerId, appearances: 0, wins: 0, losses: 0, draws: 0, pointsScored: 0, pointsConceded: 0, resultMethods: {}, kumiteBouts: 0, kataBouts: 0, tournaments: new Set<string>() });
}

export async function getTournamentResults(tournamentId: string) {
  return getPlayerResultsFromBouts(await finalBouts({ round: { draw: { competition: { tournamentId } } } }));
}

function getPlayerResultsFromBouts(bouts: FinalBout[]) {
  return bouts.map((bout) => ({ boutId: bout.id, tournament: bout.round.draw.competition.tournament, discipline: bout.round.draw.competition.discipline, redPlayer: bout.redPlayer, bluePlayer: bout.bluePlayer, result: bout.result, date: bout.result?.decidedAt ?? bout.endedAt }));
}

export async function getTournamentStats(tournamentId: string) {
  const bouts = await finalBouts({ round: { draw: { competition: { tournamentId } } } });
  const registrations = await prisma.registration.count({ where: { competition: { tournamentId } } });
  return { tournamentId, registrationsCount: registrations, completedBouts: bouts.length, totalBouts: await prisma.bout.count({ where: { round: { draw: { competition: { tournamentId } } } } }), disciplines: { kumite: bouts.filter((b) => b.round.draw.competition.discipline === "KUMITE").length, kata: bouts.filter((b) => b.round.draw.competition.discipline === "KATA").length } };
}

export async function assertAcademyAccess(academyId: string, userId: string) {
  const admin = await prisma.academyAdministrator.findUnique({ where: { academyId_userId: { academyId, userId } }, select: { id: true } });
  if (!admin) throw new AuthorizationError("Academy statistics require academy administrator access.");
}

export async function getAcademyStats(academyId: string) {
  const memberships = await prisma.academyPlayerMembership.findMany({ where: { academyId, status: "ACTIVE" }, select: { playerId: true } });
  const playerIds = memberships.map((m) => m.playerId);
  const bouts = playerIds.length ? await finalBouts({ OR: [{ redPlayerId: { in: playerIds } }, { bluePlayerId: { in: playerIds } }] }) : [];
  let wins = 0; let losses = 0;
  for (const bout of bouts) {
    if (bout.result?.winnerPlayerId && playerIds.includes(bout.result.winnerPlayerId)) wins += 1; else if (bout.result?.winnerPlayerId) losses += 1;
  }
  return { academyId, playerCount: playerIds.length, tournamentsParticipated: new Set(bouts.map((b) => b.round.draw.competition.tournamentId)).size, wins, losses, medalsWon: wins };
}

export async function rebuildPlayerStats(playerId: string, seasonId?: string) {
  const stats = await getPlayerStats(playerId, seasonId);
  const existing = await prisma.playerStats.findFirst({ where: { playerId, seasonId: seasonId ?? null }, select: { id: true } });
  const data = { bouts: stats.appearances, wins: stats.wins, losses: stats.losses, draws: stats.draws, pointsScored: stats.pointsScored, pointsConceded: stats.pointsConceded, tournamentsEntered: stats.tournamentsEntered, lastComputedAt: new Date() };
  if (existing) await prisma.playerStats.update({ where: { id: existing.id }, data });
  else await prisma.playerStats.create({ data: { playerId, seasonId: seasonId ?? null, ...data } });
  return stats;
}

export async function getCoachStats(userId: string) {
  const coach = await prisma.coachProfile.findUnique({ where: { userId }, select: { id: true } });
  if (!coach) throw new NotFoundError("Coach profile");
  const academyIds = (await prisma.academyCoachAffiliation.findMany({ where: { coachId: coach.id, status: "ACTIVE" }, select: { academyId: true } })).map((row) => row.academyId);
  const playerIds = (await prisma.academyPlayerMembership.findMany({ where: { academyId: { in: academyIds }, status: "ACTIVE" }, select: { playerId: true } })).map((row) => row.playerId);
  const bouts = playerIds.length ? await finalBouts({ OR: [{ redPlayerId: { in: playerIds } }, { bluePlayerId: { in: playerIds } }] }) : [];
  return { coachId: coach.id, studentCount: new Set(playerIds).size, studentBouts: bouts.length, studentWins: bouts.filter((bout) => bout.result?.winnerPlayerId && playerIds.includes(bout.result.winnerPlayerId)).length, studentLosses: bouts.filter((bout) => bout.result?.winnerPlayerId && !playerIds.includes(bout.result.winnerPlayerId)).length, studentMedalsWon: bouts.filter((bout) => bout.result?.winnerPlayerId && playerIds.includes(bout.result.winnerPlayerId)).length };
}

export async function rebuildTournamentStats(tournamentId: string) {
  const stats = await getTournamentStats(tournamentId);
  const academiesCount = await prisma.registration.findMany({ where: { competition: { tournamentId }, representingAcademyId: { not: null } }, select: { representingAcademyId: true }, distinct: ["representingAcademyId"] });
  await prisma.tournamentStats.upsert({ where: { tournamentId }, create: { tournamentId, registrationsCount: stats.registrationsCount, academiesCount: academiesCount.length, totalBouts: stats.totalBouts, completedBouts: stats.completedBouts, liveBouts: 0 }, update: { registrationsCount: stats.registrationsCount, academiesCount: academiesCount.length, completedBouts: stats.completedBouts, totalBouts: stats.totalBouts, liveBouts: 0, lastComputedAt: new Date() } });
  return stats;
}

export async function processFinalizedResult(boutId: string, triggeredBy = "SYSTEM") {
  const bout = await prisma.bout.findUnique({ where: { id: boutId }, select: { redPlayerId: true, bluePlayerId: true, endedAt: true, result: { select: { decidedAt: true } }, round: { select: { draw: { select: { competition: { select: { tournamentId: true, discipline: true } } } } } } } });
  if (!bout) throw new NotFoundError("Bout", boutId);
  const playerIds = [bout.redPlayerId, bout.bluePlayerId].filter((id): id is string => Boolean(id));
  const players = await prisma.playerProfile.findMany({ where: { id: { in: playerIds } }, select: { userId: true } });
  const result = await prisma.boutResult.findUnique({ where: { boutId }, select: { id: true } });
  if (result) for (const player of players) await createNotification({ userId: player.userId, type: "RESULT_FINALIZED", title: "Competition result finalized", body: "A finalized result is available in your results history.", data: { resultId: result.id, boutId } });
  for (const playerId of playerIds) await rebuildPlayerStats(playerId);
  await rebuildTournamentStats(bout.round.draw.competition.tournamentId);
  const when = bout.result?.decidedAt ?? bout.endedAt;
  const categories = await prisma.rankingCategory.findMany({ where: { rankingSeason: { rankingSystem: { discipline: bout.round.draw.competition.discipline }, ...(when ? { season: { startDate: { lte: when }, endDate: { gte: when } } } : {}) } }, select: { id: true } });
  for (const category of categories) await rebuildRanking(category.id);
  return { boutId, playerIds, tournamentId: bout.round.draw.competition.tournamentId, triggeredBy };
}

export async function getCoachResults(userId: string) {
  const coach = await prisma.coachProfile.findUnique({ where: { userId }, select: { id: true } });
  if (!coach) throw new NotFoundError("Coach profile");
  const academyIds = (await prisma.academyCoachAffiliation.findMany({ where: { coachId: coach.id, status: "ACTIVE" }, select: { academyId: true } })).map((row) => row.academyId);
  const playerIds = (await prisma.academyPlayerMembership.findMany({ where: { academyId: { in: academyIds }, status: "ACTIVE" }, select: { playerId: true } })).map((row) => row.playerId);
  return playerIds.length ? getPlayerResultsFromBouts(await finalBouts({ OR: [{ redPlayerId: { in: playerIds } }, { bluePlayerId: { in: playerIds } }] })) : [];
}