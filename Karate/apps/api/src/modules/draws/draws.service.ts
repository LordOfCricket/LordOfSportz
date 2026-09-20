import { randomInt } from "node:crypto";
import { prisma } from "@karate/database";
import type { BracketType, SeedSourceValue } from "@karate/types";
import { ConflictError, NotFoundError, ValidationError } from "@karate/shared";
import { assertValidDrawTransition } from "../../domain/drawLifecycle";
import {
  assignSingleEliminationSlots,
  generateRounds,
  type DrawEntrant,
  type ResolvedSeed,
} from "../../domain/bracketEngine";
import { listReadyRegistrationsForCompetition } from "../registrations/registrations.service";
import {
  assertUserCanManageTournament,
  getTournamentWithOrganizer,
} from "../tournaments/tournaments.service";
import { recordAudit } from "../../lib/audit";

interface ManualSeedInput {
  registrationId: string;
  seedNumber: number;
}

interface GenerateDrawInput {
  bracketType: BracketType;
  seedingStrategy: SeedSourceValue;
  manualSeeds?: ManualSeedInput[];
  /** Required to replace a LOCKED draw — the explicit "authorized re-draw" step the spec calls for. */
  force?: boolean;
}

const DRAW_INCLUDE = {
  seeds: {
    orderBy: { position: "asc" as const },
    include: { player: { select: { displayName: true } } },
  },
  rounds: {
    orderBy: { roundNumber: "asc" as const },
    include: { bouts: { orderBy: { sequenceNumber: "asc" as const } } },
  },
} as const;

async function loadCompetitionOrThrow(competitionId: string) {
  const competition = await prisma.competition.findUnique({
    where: { id: competitionId },
    select: { id: true, tournamentId: true, name: true },
  });
  if (!competition) {
    throw new NotFoundError("Competition", competitionId);
  }
  return competition;
}

async function assertCanManageDraw(tournamentId: string, actorUserId: string) {
  const tournament = await getTournamentWithOrganizer(tournamentId);
  await assertUserCanManageTournament(tournament, actorUserId);
  return tournament;
}

/**
 * Draw generation is only meaningful once weigh-in has run (readiness needs
 * a settled weigh-in result) and before the tournament has moved past
 * drawing — reuses the EXISTING tournament lifecycle enum/states rather
 * than inventing a parallel "can I draw now" flag.
 */
function assertTournamentAllowsDrawing(tournamentStatus: string) {
  if (tournamentStatus !== "WEIGH_IN" && tournamentStatus !== "DRAW_GENERATED") {
    throw new ConflictError(
      `This tournament's status (${tournamentStatus}) does not allow draw generation. It must be in WEIGH_IN or DRAW_GENERATED.`,
    );
  }
}

/** Fisher-Yates using the CSPRNG — never Math.random or any client-influenced value. */
function secureShuffle<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}

async function orderEntrants(
  ready: { registrationId: string; playerId: string; submittedAt: Date }[],
  seedingStrategy: SeedSourceValue,
  manualSeeds: ManualSeedInput[] | undefined,
): Promise<DrawEntrant[]> {
  if (seedingStrategy === "RANDOM") {
    return secureShuffle(ready).map((r) => ({ registrationId: r.registrationId, playerId: r.playerId }));
  }

  if (seedingStrategy === "MANUAL") {
    const seedMap = new Map((manualSeeds ?? []).map((s) => [s.registrationId, s.seedNumber]));
    for (const s of manualSeeds ?? []) {
      if (!ready.some((r) => r.registrationId === s.registrationId)) {
        throw new ValidationError(
          `Seed given for a registration that is not ready to compete: ${s.registrationId}`,
        );
      }
    }
    const seeded = ready
      .filter((r) => seedMap.has(r.registrationId))
      .sort((a, b) => seedMap.get(a.registrationId)! - seedMap.get(b.registrationId)!);
    const unseeded = ready.filter((r) => !seedMap.has(r.registrationId));
    return [...seeded, ...unseeded].map((r) => ({ registrationId: r.registrationId, playerId: r.playerId }));
  }

  if (seedingStrategy === "RANKING") {
    const entries = await prisma.rankingEntry.findMany({
      where: { playerId: { in: ready.map((r) => r.playerId) }, rank: { not: null } },
      select: { playerId: true, rank: true },
    });
    if (entries.length === 0) {
      throw new ConflictError(
        "No ranking data is available for any entrant in this competition. Choose MANUAL, RANDOM, or NONE instead.",
      );
    }
    const bestRankByPlayer = new Map<string, number>();
    for (const e of entries) {
      const current = bestRankByPlayer.get(e.playerId);
      if (current === undefined || e.rank! < current) bestRankByPlayer.set(e.playerId, e.rank!);
    }
    const ranked = ready
      .filter((r) => bestRankByPlayer.has(r.playerId))
      .sort((a, b) => bestRankByPlayer.get(a.playerId)! - bestRankByPlayer.get(b.playerId)!);
    const unranked = ready.filter((r) => !bestRankByPlayer.has(r.playerId));
    return [...ranked, ...unranked].map((r) => ({ registrationId: r.registrationId, playerId: r.playerId }));
  }

  // NONE — registration order, already how `ready` is sorted (submittedAt asc).
  return ready.map((r) => ({ registrationId: r.registrationId, playerId: r.playerId }));
}

function toDrawDto(draw: NonNullable<Awaited<ReturnType<typeof getActiveDraw>>>) {
  const nameByPlayerId = new Map(draw.seeds.map((s) => [s.playerId, s.player.displayName]));
  return {
    id: draw.id,
    competitionId: draw.competitionId,
    version: draw.version,
    bracketType: draw.bracketType,
    status: draw.status,
    seedingStrategy: draw.seedingStrategy,
    generatedByUserId: draw.generatedByUserId,
    generatedAt: draw.generatedAt,
    seeds: draw.seeds.map((s) => ({
      registrationId: s.registrationId,
      playerId: s.playerId,
      displayName: s.player.displayName,
      seedNumber: s.seedNumber,
      seedSource: s.seedSource,
      position: s.position,
    })),
    rounds: draw.rounds.map((r) => ({
      id: r.id,
      roundNumber: r.roundNumber,
      name: r.name,
      bouts: r.bouts.map((b) => ({
        id: b.id,
        sequenceNumber: b.sequenceNumber,
        redPlayerId: b.redPlayerId,
        redPlayerName: b.redPlayerId ? (nameByPlayerId.get(b.redPlayerId) ?? null) : null,
        bluePlayerId: b.bluePlayerId,
        bluePlayerName: b.bluePlayerId ? (nameByPlayerId.get(b.bluePlayerId) ?? null) : null,
        isBye: b.redPlayerId === null || b.bluePlayerId === null,
        status: b.status,
      })),
    })),
  };
}

async function getActiveDraw(competitionId: string) {
  return prisma.draw.findFirst({ where: { competitionId, isActive: true }, include: DRAW_INCLUDE });
}

export async function generateDraw(competitionId: string, actorUserId: string, input: GenerateDrawInput) {
  const competition = await loadCompetitionOrThrow(competitionId);
  const tournament = await assertCanManageDraw(competition.tournamentId, actorUserId);
  assertTournamentAllowsDrawing(tournament.status);

  const existing = await getActiveDraw(competitionId);
  if (existing && existing.status === "LOCKED" && !input.force) {
    throw new ConflictError(
      "This competition's draw is locked. Pass force=true to perform an explicit, authorized re-draw.",
    );
  }

  const ready = await listReadyRegistrationsForCompetition(competitionId);
  const uniqueByPlayer = new Map(ready.map((r) => [r.playerId, r]));
  if (uniqueByPlayer.size !== ready.length) {
    throw new ConflictError(
      "Duplicate player detected among ready registrations — refusing to generate a draw.",
    );
  }
  if (ready.length < 2) {
    throw new ValidationError("At least 2 competition-ready registrations are required to generate a draw.");
  }

  const orderedEntrants = await orderEntrants(ready, input.seedingStrategy, input.manualSeeds);

  let slots: (ResolvedSeed | null)[] = [];
  if (input.bracketType === "SINGLE_ELIMINATION") {
    const assigned = assignSingleEliminationSlots(orderedEntrants, input.seedingStrategy);
    slots = assigned.slots;
  } else {
    // Round robin has no bracket "slots" to seed into — every entrant plays regardless of order,
    // so seeds are recorded 1..n in the resolved order purely for display/audit.
    slots = orderedEntrants.map((e, i) => ({
      registrationId: e.registrationId,
      playerId: e.playerId,
      seedNumber: input.seedingStrategy === "MANUAL" || input.seedingStrategy === "RANKING" ? i + 1 : null,
      position: i,
    }));
  }
  const generatedRounds = generateRounds(input.bracketType, slots, orderedEntrants);

  const drawId = await prisma.$transaction(async (tx) => {
    if (existing) {
      await tx.draw.update({ where: { id: existing.id }, data: { isActive: false, status: "SUPERSEDED" } });
    }
    const created = await tx.draw.create({
      data: {
        competitionId,
        version: (existing?.version ?? 0) + 1,
        bracketType: input.bracketType,
        seedingStrategy: input.seedingStrategy,
        generatedByUserId: actorUserId,
      },
    });
    await tx.drawSeed.createMany({
      data: slots
        .filter((s): s is ResolvedSeed => s !== null)
        .map((s) => ({
          drawId: created.id,
          registrationId: s.registrationId,
          playerId: s.playerId,
          seedNumber: s.seedNumber,
          seedSource: input.seedingStrategy,
          position: s.position,
        })),
    });
    for (const round of generatedRounds) {
      const createdRound = await tx.round.create({
        data: { drawId: created.id, roundNumber: round.roundNumber, name: round.name },
      });
      if (round.bouts.length > 0) {
        await tx.bout.createMany({
          data: round.bouts.map((b) => ({
            roundId: createdRound.id,
            sequenceNumber: b.sequenceNumber,
            redPlayerId: b.redPlayerId,
            bluePlayerId: b.bluePlayerId,
          })),
        });
      }
    }
    return created.id;
  });

  await recordAudit(actorUserId, "DRAW_GENERATED", "Draw", drawId, {
    competitionId,
    bracketType: input.bracketType,
    seedingStrategy: input.seedingStrategy,
    entrantCount: ready.length,
  });

  const draw = await getActiveDraw(competitionId);
  return toDrawDto(draw!);
}

export async function getDrawForCompetition(competitionId: string, actorUserId: string | null) {
  const competition = await loadCompetitionOrThrow(competitionId);
  const draw = await getActiveDraw(competitionId);
  if (!draw) {
    throw new NotFoundError("Draw for this competition");
  }
  if (draw.status === "DRAFT") {
    if (!actorUserId) {
      throw new NotFoundError("Draw for this competition");
    }
    const tournament = await getTournamentWithOrganizer(competition.tournamentId);
    await assertUserCanManageTournament(tournament, actorUserId);
  }
  return toDrawDto(draw);
}

async function loadDrawOrThrow(drawId: string) {
  const draw = await prisma.draw.findUnique({ where: { id: drawId }, include: DRAW_INCLUDE });
  if (!draw) {
    throw new NotFoundError("Draw", drawId);
  }
  return draw;
}

export async function publishDraw(drawId: string, actorUserId: string) {
  const draw = await loadDrawOrThrow(drawId);
  const competition = await loadCompetitionOrThrow(draw.competitionId);
  await assertCanManageDraw(competition.tournamentId, actorUserId);
  assertValidDrawTransition(draw.status, "PUBLISHED");

  await prisma.draw.update({ where: { id: drawId }, data: { status: "PUBLISHED" } });
  await recordAudit(actorUserId, "DRAW_PUBLISHED", "Draw", drawId);
  return toDrawDto(await loadDrawOrThrow(drawId));
}

export async function lockDraw(drawId: string, actorUserId: string) {
  const draw = await loadDrawOrThrow(drawId);
  const competition = await loadCompetitionOrThrow(draw.competitionId);
  await assertCanManageDraw(competition.tournamentId, actorUserId);
  assertValidDrawTransition(draw.status, "LOCKED");

  await prisma.draw.update({ where: { id: drawId }, data: { status: "LOCKED" } });
  await recordAudit(actorUserId, "DRAW_LOCKED", "Draw", drawId);
  return toDrawDto(await loadDrawOrThrow(drawId));
}
