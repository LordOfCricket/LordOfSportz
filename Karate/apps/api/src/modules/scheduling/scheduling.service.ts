import { prisma } from "@karate/database";
import { ConflictError, NotFoundError, ValidationError } from "@karate/shared";
import { assertValidScheduleTransition } from "../../domain/scheduleLifecycle";
import { generateSchedule as runSchedulingEngine, type SchedulableBout } from "../../domain/schedulingEngine";
import {
  assertUserCanManageTournament,
  getTournamentWithOrganizer,
} from "../tournaments/tournaments.service";
import { recordAudit } from "../../lib/audit";
import { emitCompetitionEvent } from "../../lib/realtime";

interface BlockedPeriodInput {
  startAt: Date;
  endAt: Date;
}

interface GenerateScheduleInput {
  startAt: Date;
  breakMinutesBetweenRounds?: number;
  blockedPeriods?: BlockedPeriodInput[];
  force?: boolean;
}

const SCHEDULE_ENTRY_SELECT = {
  id: true,
  boutId: true,
  tatamiId: true,
  scheduledAt: true,
  estimatedDurationMinutes: true,
  sequenceOrder: true,
  bout: {
    select: {
      id: true,
      status: true,
      redPlayerId: true,
      bluePlayerId: true,
      redPlayer: { select: { displayName: true } },
      bluePlayer: { select: { displayName: true } },
      round: {
        select: {
          roundNumber: true,
          name: true,
          draw: { select: { competitionId: true, competition: { select: { discipline: true } } } },
        },
      },
    },
  },
  tatami: { select: { id: true, label: true } },
} as const;

async function assertCanManageTournament(tournamentId: string, actorUserId: string) {
  const tournament = await getTournamentWithOrganizer(tournamentId);
  await assertUserCanManageTournament(tournament, actorUserId);
  return tournament;
}

function toScheduleDto(schedule: {
  id: string;
  tournamentId: string;
  version: number;
  status: string;
  delayMinutes: number;
  generatedByUserId: string;
  generatedAt: Date;
  notes: string | null;
  entries: Array<{
    id: string;
    boutId: string;
    tatamiId: string | null;
    scheduledAt: Date;
    estimatedDurationMinutes: number;
    sequenceOrder: number;
    bout: {
      id: string;
      status: string;
      redPlayerId: string | null;
      bluePlayerId: string | null;
      redPlayer: { displayName: string } | null;
      bluePlayer: { displayName: string } | null;
      round: {
        roundNumber: number;
        name: string | null;
        draw: { competitionId: string; competition: { discipline: string } };
      };
    };
    tatami: { id: string; label: string } | null;
  }>;
}) {
  return {
    id: schedule.id,
    tournamentId: schedule.tournamentId,
    version: schedule.version,
    status: schedule.status,
    delayMinutes: schedule.delayMinutes,
    generatedByUserId: schedule.generatedByUserId,
    generatedAt: schedule.generatedAt,
    entries: schedule.entries
      .sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime())
      .map((e) => ({
        id: e.id,
        boutId: e.boutId,
        competitionId: e.bout.round.draw.competitionId,
        discipline: e.bout.round.draw.competition.discipline,
        roundNumber: e.bout.round.roundNumber,
        roundName: e.bout.round.name,
        redPlayerId: e.bout.redPlayerId,
        redPlayerName: e.bout.redPlayer?.displayName ?? null,
        bluePlayerId: e.bout.bluePlayerId,
        bluePlayerName: e.bout.bluePlayer?.displayName ?? null,
        boutStatus: e.bout.status,
        tatami: e.tatami,
        scheduledAt: e.scheduledAt,
        estimatedDurationMinutes: e.estimatedDurationMinutes,
        sequenceOrder: e.sequenceOrder,
      })),
  };
}

async function getActiveScheduleRow(tournamentId: string) {
  return prisma.schedule.findFirst({
    where: { tournamentId, isActive: true },
    include: { entries: { select: SCHEDULE_ENTRY_SELECT } },
  });
}

export async function generateTournamentSchedule(
  tournamentId: string,
  actorUserId: string,
  input: GenerateScheduleInput,
) {
  await assertCanManageTournament(tournamentId, actorUserId);

  const existing = await getActiveScheduleRow(tournamentId);
  if (existing && existing.status !== "DRAFT" && !input.force) {
    throw new ConflictError(
      `This tournament's schedule is already ${existing.status}. Pass force=true to perform an explicit, authorized revision.`,
    );
  }

  const tatamis = await prisma.tatami.findMany({
    where: { tournamentId, status: { notIn: ["CLOSED", "MAINTENANCE"] } },
    orderBy: { label: "asc" },
    select: { id: true },
  });
  if (tatamis.length === 0) {
    throw new ValidationError("No available tatamis exist for this tournament yet.");
  }

  const competitions = await prisma.competition.findMany({
    where: { tournamentId },
    select: {
      id: true,
      category: { select: { estimatedBoutDurationMinutes: true } },
      draws: {
        where: { isActive: true, status: "LOCKED" },
        select: {
          rounds: {
            orderBy: { roundNumber: "asc" },
            select: {
              roundNumber: true,
              bouts: {
                orderBy: { sequenceNumber: "asc" },
                select: { id: true, redPlayerId: true, bluePlayerId: true },
              },
            },
          },
        },
      },
    },
  });

  const boutsByCompetition = new Map<string, SchedulableBout[]>();
  for (const competition of competitions) {
    const draw = competition.draws[0];
    if (!draw) continue;
    const bouts: SchedulableBout[] = draw.rounds.flatMap((round) =>
      round.bouts.map((b) => ({
        boutId: b.id,
        competitionId: competition.id,
        roundNumber: round.roundNumber,
        redPlayerId: b.redPlayerId,
        bluePlayerId: b.bluePlayerId,
        isBye: b.redPlayerId === null || b.bluePlayerId === null,
        durationMinutes: competition.category.estimatedBoutDurationMinutes,
      })),
    );
    if (bouts.length > 0) boutsByCompetition.set(competition.id, bouts);
  }
  if (boutsByCompetition.size === 0) {
    throw new ValidationError("No locked draws with bouts exist yet for this tournament.");
  }

  const computed = runSchedulingEngine({
    startAt: input.startAt,
    tatamiIds: tatamis.map((t) => t.id),
    boutsByCompetition,
    breakMinutesBetweenRounds: input.breakMinutesBetweenRounds,
    blockedPeriods: input.blockedPeriods,
  });

  const scheduleId = await prisma.$transaction(async (tx) => {
    if (existing) {
      await tx.schedule.update({ where: { id: existing.id }, data: { isActive: false } });
    }
    const created = await tx.schedule.create({
      data: { tournamentId, version: (existing?.version ?? 0) + 1, generatedByUserId: actorUserId },
    });
    await tx.boutSchedule.createMany({
      data: computed.map((e) => ({
        scheduleId: created.id,
        boutId: e.boutId,
        tatamiId: e.tatamiId,
        scheduledAt: e.scheduledAt,
        estimatedDurationMinutes: e.estimatedDurationMinutes,
        sequenceOrder: e.sequenceOrder,
      })),
    });
    return created.id;
  });

  await recordAudit(actorUserId, "SCHEDULE_GENERATED", "Schedule", scheduleId, {
    tournamentId,
    entryCount: computed.length,
  });

  const schedule = await prisma.schedule.findUnique({
    where: { id: scheduleId },
    include: { entries: { select: SCHEDULE_ENTRY_SELECT } },
  });
  const dto = toScheduleDto(schedule!);
  emitCompetitionEvent({
    eventType: "SCHEDULE_CHANGED",
    entityType: "Schedule",
    entityId: scheduleId,
    tournamentId,
    payload: { schedule: dto },
    actorUserId,
  });
  return dto;
}

export async function getScheduleForTournament(tournamentId: string, actorUserId: string | null) {
  const schedule = await getActiveScheduleRow(tournamentId);
  if (!schedule) {
    throw new NotFoundError("Schedule for this tournament");
  }
  if (schedule.status === "DRAFT") {
    if (!actorUserId) {
      throw new NotFoundError("Schedule for this tournament");
    }
    await assertCanManageTournament(tournamentId, actorUserId);
  }
  return toScheduleDto(schedule);
}

async function loadScheduleOrThrow(scheduleId: string) {
  const schedule = await prisma.schedule.findUnique({
    where: { id: scheduleId },
    include: { entries: { select: SCHEDULE_ENTRY_SELECT } },
  });
  if (!schedule) {
    throw new NotFoundError("Schedule", scheduleId);
  }
  return schedule;
}

export async function publishSchedule(scheduleId: string, actorUserId: string) {
  const schedule = await loadScheduleOrThrow(scheduleId);
  await assertCanManageTournament(schedule.tournamentId, actorUserId);
  assertValidScheduleTransition(schedule.status, "PUBLISHED");

  await prisma.schedule.update({ where: { id: scheduleId }, data: { status: "PUBLISHED" } });
  await recordAudit(actorUserId, "SCHEDULE_PUBLISHED", "Schedule", scheduleId);
  return toScheduleDto(await loadScheduleOrThrow(scheduleId));
}

/**
 * Delays every not-yet-started bout on ONE tatami by a flat offset and
 * records it as a new schedule version — the previous version's entries are
 * left completely untouched for history. Deliberately scoped to a single
 * tatami's own sequence: it does not attempt to re-optimize cross-tatami
 * player-conflict windows, which would effectively be a full re-generation.
 * An organizer who needs that can call generate again with force=true.
 */
export async function recordScheduleDelay(
  scheduleId: string,
  actorUserId: string,
  input: { tatamiId: string; delayMinutes: number; reason?: string },
) {
  if (input.delayMinutes <= 0) {
    throw new ValidationError("delayMinutes must be a positive number.");
  }
  const schedule = await loadScheduleOrThrow(scheduleId);
  await assertCanManageTournament(schedule.tournamentId, actorUserId);
  assertValidScheduleTransition(schedule.status, "DELAYED");

  const tatami = await prisma.tatami.findUnique({ where: { id: input.tatamiId } });
  if (!tatami || tatami.tournamentId !== schedule.tournamentId) {
    throw new NotFoundError("Tatami", input.tatamiId);
  }

  const newScheduleId = await prisma.$transaction(async (tx) => {
    await tx.schedule.update({ where: { id: schedule.id }, data: { isActive: false } });
    const created = await tx.schedule.create({
      data: {
        tournamentId: schedule.tournamentId,
        version: schedule.version + 1,
        status: "DELAYED",
        delayMinutes: input.delayMinutes,
        generatedByUserId: actorUserId,
        notes: input.reason,
      },
    });
    await tx.boutSchedule.createMany({
      data: schedule.entries.map((e) => {
        const shouldShift = e.tatamiId === input.tatamiId && e.bout.status === "SCHEDULED";
        const scheduledAt = shouldShift
          ? new Date(e.scheduledAt.getTime() + input.delayMinutes * 60_000)
          : e.scheduledAt;
        return {
          scheduleId: created.id,
          boutId: e.boutId,
          tatamiId: e.tatamiId,
          scheduledAt,
          estimatedDurationMinutes: e.estimatedDurationMinutes,
          sequenceOrder: e.sequenceOrder,
        };
      }),
    });
    return created.id;
  });

  await recordAudit(actorUserId, "SCHEDULE_DELAYED", "Schedule", newScheduleId, {
    tatamiId: input.tatamiId,
    delayMinutes: input.delayMinutes,
  });
  return toScheduleDto(await loadScheduleOrThrow(newScheduleId));
}

/** Reused by player/coach/academy schedule views — the single place that resolves "this player's upcoming bouts" from the active schedule of whichever tournament each bout belongs to. */
export async function listUpcomingBoutsForPlayers(playerIds: string[]) {
  if (playerIds.length === 0) return [];
  const entries = await prisma.boutSchedule.findMany({
    where: {
      schedule: { isActive: true },
      scheduledAt: { gte: new Date() },
      bout: { OR: [{ redPlayerId: { in: playerIds } }, { bluePlayerId: { in: playerIds } }] },
    },
    select: SCHEDULE_ENTRY_SELECT,
    orderBy: { scheduledAt: "asc" },
  });
  return entries.map((e) => ({
    id: e.id,
    boutId: e.boutId,
    competitionId: e.bout.round.draw.competitionId,
    discipline: e.bout.round.draw.competition.discipline,
    roundNumber: e.bout.round.roundNumber,
    roundName: e.bout.round.name,
    redPlayerId: e.bout.redPlayerId,
    redPlayerName: e.bout.redPlayer?.displayName ?? null,
    bluePlayerId: e.bout.bluePlayerId,
    bluePlayerName: e.bout.bluePlayer?.displayName ?? null,
    boutStatus: e.bout.status,
    tatami: e.tatami,
    scheduledAt: e.scheduledAt,
    estimatedDurationMinutes: e.estimatedDurationMinutes,
  }));
}

export async function getMyUpcomingBouts(actorUserId: string) {
  const profile = await prisma.playerProfile.findUnique({ where: { userId: actorUserId } });
  if (!profile) {
    throw new NotFoundError("Player profile");
  }
  return listUpcomingBoutsForPlayers([profile.id]);
}

/** Same "students" relationship as the registrations/grading domains — players sharing an ACTIVE academy with this coach. */
export async function getMyStudentsUpcomingBouts(actorUserId: string) {
  const coachProfile = await prisma.coachProfile.findUnique({ where: { userId: actorUserId } });
  if (!coachProfile) {
    throw new NotFoundError("Coach profile");
  }
  const activeAcademyIds = (
    await prisma.academyCoachAffiliation.findMany({
      where: { coachId: coachProfile.id, status: "ACTIVE" },
      select: { academyId: true },
    })
  ).map((a) => a.academyId);
  if (activeAcademyIds.length === 0) return [];
  const playerIds = (
    await prisma.academyPlayerMembership.findMany({
      where: { academyId: { in: activeAcademyIds }, status: "ACTIVE" },
      select: { playerId: true },
    })
  ).map((m) => m.playerId);
  return listUpcomingBoutsForPlayers(playerIds);
}

export async function getAcademyUpcomingBouts(academyId: string) {
  const playerIds = (
    await prisma.academyPlayerMembership.findMany({
      where: { academyId, status: "ACTIVE" },
      select: { playerId: true },
    })
  ).map((m) => m.playerId);
  return listUpcomingBoutsForPlayers(playerIds);
}
