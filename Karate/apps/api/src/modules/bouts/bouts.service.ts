import { prisma } from "@karate/database";
import type { BoutResultMethodValue } from "@karate/types";
import { AuthorizationError, ConflictError, NotFoundError, ValidationError } from "@karate/shared";
import { assertValidBoutTransition } from "../../domain/boutLifecycle";
import {
  assertUserCanManageTournament,
  getTournamentWithOrganizer,
} from "../tournaments/tournaments.service";
import { recordAudit } from "../../lib/audit";
import { emitCompetitionEvent } from "../../lib/realtime";
import { processFinalizedResult } from "../stats/stats.service";

const BOUT_DETAIL_INCLUDE = {
  round: {
    select: {
      roundNumber: true,
      name: true,
      draw: { select: { competitionId: true, competition: { select: { tournamentId: true } } } },
    },
  },
  redPlayer: { select: { id: true, displayName: true } },
  bluePlayer: { select: { id: true, displayName: true } },
  redTeam: { select: { id: true, name: true } },
  blueTeam: { select: { id: true, name: true } },
  result: true,
  boutSchedules: {
    where: { schedule: { isActive: true } },
    select: {
      scheduledAt: true,
      estimatedDurationMinutes: true,
      tatami: { select: { id: true, label: true } },
    },
  },
} as const;

async function loadBoutOrThrow(boutId: string) {
  const bout = await prisma.bout.findUnique({ where: { id: boutId }, include: BOUT_DETAIL_INCLUDE });
  if (!bout) {
    throw new NotFoundError("Bout", boutId);
  }
  return bout;
}

function tournamentIdOf(bout: Awaited<ReturnType<typeof loadBoutOrThrow>>): string {
  return bout.round.draw.competition.tournamentId;
}

async function assertCanManageBout(bout: Awaited<ReturnType<typeof loadBoutOrThrow>>, actorUserId: string) {
  const tournament = await getTournamentWithOrganizer(tournamentIdOf(bout));
  await assertUserCanManageTournament(tournament, actorUserId);
}

function toBoutDto(bout: Awaited<ReturnType<typeof loadBoutOrThrow>>) {
  const schedule = bout.boutSchedules[0] ?? null;
  return {
    id: bout.id,
    competitionId: bout.round.draw.competitionId,
    roundNumber: bout.round.roundNumber,
    roundName: bout.round.name,
    sequenceNumber: bout.sequenceNumber,
    status: bout.status,
    redPlayer: bout.redPlayer,
    bluePlayer: bout.bluePlayer,
    redTeam: bout.redTeam,
    blueTeam: bout.blueTeam,
    isBye:
      (bout.redPlayerId === null && bout.redTeamId === null) ||
      (bout.bluePlayerId === null && bout.blueTeamId === null),
    startedAt: bout.startedAt,
    endedAt: bout.endedAt,
    cancelReason: bout.cancelReason,
    scheduledAt: schedule?.scheduledAt ?? null,
    estimatedDurationMinutes: schedule?.estimatedDurationMinutes ?? null,
    tatami: schedule?.tatami ?? null,
    result: bout.result
      ? {
          method: bout.result.method,
          reason: bout.result.reason,
          winnerPlayerId: bout.result.winnerPlayerId,
          winnerTeamId: bout.result.winnerTeamId,
          finalScoreRed: bout.result.finalScoreRed,
          finalScoreBlue: bout.result.finalScoreBlue,
          isFinal: bout.result.isFinal,
          decidedAt: bout.result.decidedAt,
        }
      : null,
  };
}

/**
 * Re-checked at CALL time, not just at draw-generation time — a player's
 * readiness or registration status can change in the time between
 * scheduling and the bout actually being called to the mat. A bye or a
 * still-TBD (both-null) slot is never callable.
 */
async function assertParticipantsStillValid(bout: Awaited<ReturnType<typeof loadBoutOrThrow>>) {
  if (bout.redPlayerId === null || bout.bluePlayerId === null) {
    throw new ConflictError("This bout has a bye or an undecided slot and cannot be called.");
  }
  if (bout.redPlayerId === bout.bluePlayerId) {
    // Defensive only — the draw engine can never produce this, but a bout must never be called with a player facing themselves.
    throw new ConflictError("A bout cannot have the same player on both sides.");
  }

  const registrations = await prisma.registration.findMany({
    where: {
      competitionId: bout.round.draw.competitionId,
      playerId: { in: [bout.redPlayerId, bout.bluePlayerId] },
    },
    select: { playerId: true, status: true },
  });
  for (const playerId of [bout.redPlayerId, bout.bluePlayerId]) {
    const registration = registrations.find((r) => r.playerId === playerId);
    if (!registration) {
      throw new ConflictError(`Player ${playerId} has no registration for this competition.`);
    }
    if (registration.status === "WITHDRAWN" || registration.status === "REJECTED") {
      throw new ConflictError(
        `Player ${playerId}'s registration is ${registration.status} and cannot compete.`,
      );
    }
  }
}

export async function callBout(boutId: string, actorUserId: string) {
  const bout = await loadBoutOrThrow(boutId);
  await assertCanManageBout(bout, actorUserId);
  await assertParticipantsStillValid(bout);
  assertValidBoutTransition(bout.status, "CALLED");

  await prisma.bout.update({ where: { id: boutId }, data: { status: "CALLED" } });
  await recordAudit(actorUserId, "BOUT_CALLED", "Bout", boutId);
  const updatedBout = await loadBoutOrThrow(boutId);
  emitCompetitionEvent({
    eventType: "BOUT_CALLED",
    entityType: "Bout",
    entityId: boutId,
    tournamentId: tournamentIdOf(updatedBout),
    competitionId: updatedBout.round.draw.competitionId,
    payload: { bout: toBoutDto(updatedBout) },
    actorUserId,
  });
  return toBoutDto(updatedBout);
}

export async function markBoutReady(boutId: string, actorUserId: string) {
  const bout = await loadBoutOrThrow(boutId);
  await assertCanManageBout(bout, actorUserId);
  assertValidBoutTransition(bout.status, "READY");

  await prisma.bout.update({ where: { id: boutId }, data: { status: "READY" } });
  await recordAudit(actorUserId, "BOUT_READY", "Bout", boutId);
  return toBoutDto(await loadBoutOrThrow(boutId));
}

export async function pauseBout(boutId: string, actorUserId: string, reason?: string) {
  const bout = await loadBoutOrThrow(boutId);
  await assertCanManageBout(bout, actorUserId);
  assertValidBoutTransition(bout.status, "PAUSED");

  await prisma.bout.update({ where: { id: boutId }, data: { status: "PAUSED" } });
  await recordAudit(actorUserId, "BOUT_PAUSED", "Bout", boutId, { reason });
  return toBoutDto(await loadBoutOrThrow(boutId));
}

/** The resume action itself is what's audited — PAUSED -> IN_PROGRESS is not a distinct persisted "RESUMED" status. */
export async function resumeBout(boutId: string, actorUserId: string) {
  const bout = await loadBoutOrThrow(boutId);
  await assertCanManageBout(bout, actorUserId);
  assertValidBoutTransition(bout.status, "IN_PROGRESS");

  await prisma.bout.update({ where: { id: boutId }, data: { status: "IN_PROGRESS" } });
  await recordAudit(actorUserId, "BOUT_RESUMED", "Bout", boutId);
  return toBoutDto(await loadBoutOrThrow(boutId));
}

interface RecordResultInput {
  method: BoutResultMethodValue;
  winnerPlayerId?: string;
  /** Team Kata (Art. 3.5) — set instead of winnerPlayerId when the bout's sides are KataTeams. */
  winnerTeamId?: string;
  finalScoreRed?: number;
  finalScoreBlue?: number;
  reason?: string;
}

/**
 * Records the bout's outcome and moves it to FINISHED. This is the generic,
 * discipline-agnostic core — Kumite/Kata engines call `applyBoutResult`
 * directly once they have already authorized the acting official themselves
 * (a Referee is not the tournament organizer, so the organizer-only check
 * below does not apply to them).
 */
export async function applyBoutResult(boutId: string, input: RecordResultInput) {
  const bout = await loadBoutOrThrow(boutId);
  assertValidBoutTransition(bout.status, "FINISHED");

  if (
    input.winnerPlayerId &&
    input.winnerPlayerId !== bout.redPlayerId &&
    input.winnerPlayerId !== bout.bluePlayerId
  ) {
    throw new ValidationError("winnerPlayerId must be one of this bout's two participants.");
  }
  if (input.winnerTeamId && input.winnerTeamId !== bout.redTeamId && input.winnerTeamId !== bout.blueTeamId) {
    throw new ValidationError("winnerTeamId must be one of this bout's two Teams.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.bout.update({ where: { id: boutId }, data: { status: "FINISHED", endedAt: new Date() } });
    await tx.boutResult.upsert({
      where: { boutId },
      create: {
        boutId,
        method: input.method,
        winnerPlayerId: input.winnerPlayerId,
        winnerTeamId: input.winnerTeamId,
        finalScoreRed: input.finalScoreRed,
        finalScoreBlue: input.finalScoreBlue,
        reason: input.reason,
      },
      update: {
        method: input.method,
        winnerPlayerId: input.winnerPlayerId,
        winnerTeamId: input.winnerTeamId,
        finalScoreRed: input.finalScoreRed,
        finalScoreBlue: input.finalScoreBlue,
        reason: input.reason,
      },
    });
  });

  return toBoutDto(await loadBoutOrThrow(boutId));
}

/** Organizer-only entry point — the generic, discipline-agnostic path (walkover/no-show/injury/DQ/withdrawal/draw). */
export async function recordBoutResult(boutId: string, actorUserId: string, input: RecordResultInput) {
  const bout = await loadBoutOrThrow(boutId);
  await assertCanManageBout(bout, actorUserId);
  const result = await applyBoutResult(boutId, input);
  await recordAudit(actorUserId, "BOUT_RESULT_RECORDED", "Bout", boutId, { method: input.method });
  return result;
}

/** Terminal — once finalized, this Phase's API never touches the result again (a correction workflow is a distinct, explicitly-audited future concern). */
export async function finalizeBout(boutId: string, actorUserId: string) {
  const bout = await loadBoutOrThrow(boutId);
  await assertCanManageBout(bout, actorUserId);
  if (!bout.result) {
    throw new ConflictError("This bout has no recorded result to finalize.");
  }
  assertValidBoutTransition(bout.status, "FINALIZED");

  await prisma.$transaction(async (tx) => {
    await tx.bout.update({ where: { id: boutId }, data: { status: "FINALIZED" } });
    await tx.boutResult.update({
      where: { boutId },
      data: { isFinal: true, confirmedByUserId: actorUserId },
    });
  });
  await recordAudit(actorUserId, "BOUT_FINALIZED", "Bout", boutId);
  await processFinalizedResult(boutId, actorUserId);
  return toBoutDto(await loadBoutOrThrow(boutId));
}

export async function correctFinalizedBoutResult(boutId: string, actorUserId: string, input: {
  winnerPlayerId?: string | null; winnerTeamId?: string | null; method?: BoutResultMethodValue;
  finalScoreRed?: number | null; finalScoreBlue?: number | null; reason?: string; correctionReason: string;
}) {
  const bout = await loadBoutOrThrow(boutId);
  await assertCanManageBout(bout, actorUserId);
  if (!bout.result?.isFinal || !bout.result.id) throw new ConflictError("Only finalized results can be corrected.");
  const previous = { winnerPlayerId: bout.result.winnerPlayerId, winnerTeamId: bout.result.winnerTeamId, method: bout.result.method, finalScoreRed: bout.result.finalScoreRed, finalScoreBlue: bout.result.finalScoreBlue, reason: bout.result.reason };
  if (input.winnerPlayerId && input.winnerPlayerId !== bout.redPlayerId && input.winnerPlayerId !== bout.bluePlayerId) throw new ValidationError("Corrected winner must be a bout participant.");
  if (input.winnerTeamId && input.winnerTeamId !== bout.redTeamId && input.winnerTeamId !== bout.blueTeamId) throw new ValidationError("Corrected winner team must be a bout participant.");
  const corrected = { ...previous, ...Object.fromEntries(Object.entries(input).filter(([key]) => key !== "correctionReason" && input[key as keyof typeof input] !== undefined)) };
  await prisma.$transaction(async (tx) => {
    await tx.boutResultCorrection.create({ data: { boutResultId: bout.result!.id, correctedByUserId: actorUserId, reason: input.correctionReason, previousValue: previous, correctedValue: corrected } });
    await tx.boutResult.update({ where: { id: bout.result!.id }, data: corrected });
  });
  await recordAudit(actorUserId, "BOUT_RESULT_CORRECTED", "BoutResult", bout.result.id, { reason: input.correctionReason, previous, corrected });
  return processFinalizedResult(boutId, actorUserId);
}

export async function sendBoutToReview(boutId: string, actorUserId: string) {
  const bout = await loadBoutOrThrow(boutId);
  await assertCanManageBout(bout, actorUserId);
  assertValidBoutTransition(bout.status, "UNDER_REVIEW");

  await prisma.bout.update({ where: { id: boutId }, data: { status: "UNDER_REVIEW" } });
  await recordAudit(actorUserId, "BOUT_SENT_TO_REVIEW", "Bout", boutId);
  return toBoutDto(await loadBoutOrThrow(boutId));
}

export async function cancelBout(boutId: string, actorUserId: string, reason: string) {
  const bout = await loadBoutOrThrow(boutId);
  await assertCanManageBout(bout, actorUserId);
  assertValidBoutTransition(bout.status, "CANCELLED");

  await prisma.bout.update({ where: { id: boutId }, data: { status: "CANCELLED", cancelReason: reason } });
  await recordAudit(actorUserId, "BOUT_CANCELLED", "Bout", boutId, { reason });
  return toBoutDto(await loadBoutOrThrow(boutId));
}

export async function getBoutById(boutId: string, actorUserId: string | null) {
  const bout = await loadBoutOrThrow(boutId);
  // Any authenticated user may view a bout's public state — no private data lives here (see toBoutDto).
  if (!actorUserId) {
    throw new AuthorizationError("Sign in to view bout details.");
  }
  return toBoutDto(bout);
}

/** Reused by player/coach/academy bout views — "this player's bouts across all tournaments," never another player's private data. */
export async function listBoutsForPlayers(playerIds: string[]) {
  if (playerIds.length === 0) return [];
  const bouts = await prisma.bout.findMany({
    where: { OR: [{ redPlayerId: { in: playerIds } }, { bluePlayerId: { in: playerIds } }] },
    include: BOUT_DETAIL_INCLUDE,
    orderBy: { round: { roundNumber: "asc" } },
  });
  return bouts.map(toBoutDto);
}

export async function getMyBouts(actorUserId: string) {
  const profile = await prisma.playerProfile.findUnique({ where: { userId: actorUserId } });
  if (!profile) {
    throw new NotFoundError("Player profile");
  }
  return listBoutsForPlayers([profile.id]);
}

/** Same "students" relationship as the registrations/scheduling/grading domains — players sharing an ACTIVE academy with this coach. */
export async function getMyStudentsBouts(actorUserId: string) {
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
  return listBoutsForPlayers(playerIds);
}

export async function getAcademyBouts(academyId: string) {
  const playerIds = (
    await prisma.academyPlayerMembership.findMany({
      where: { academyId, status: "ACTIVE" },
      select: { playerId: true },
    })
  ).map((m) => m.playerId);
  return listBoutsForPlayers(playerIds);
}
