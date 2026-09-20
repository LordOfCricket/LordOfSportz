import { prisma } from "@karate/database";
import type { TatamiStatusValue } from "@karate/types";
import { ConflictError, NotFoundError } from "@karate/shared";
import { assertValidTatamiTransition } from "../../domain/tatamiLifecycle";
import { assertValidBoutTransition } from "../../domain/boutLifecycle";
import {
  assertUserCanManageTournament,
  getTournamentWithOrganizer,
} from "../tournaments/tournaments.service";
import { recordAudit } from "../../lib/audit";
import { emitCompetitionEvent } from "../../lib/realtime";

const TATAMI_SELECT = { id: true, tournamentId: true, label: true, status: true } as const;

async function assertCanManageTournament(tournamentId: string, actorUserId: string) {
  const tournament = await getTournamentWithOrganizer(tournamentId);
  await assertUserCanManageTournament(tournament, actorUserId);
  return tournament;
}

export async function createTatami(tournamentId: string, actorUserId: string, label: string) {
  await assertCanManageTournament(tournamentId, actorUserId);

  try {
    const tatami = await prisma.tatami.create({ data: { tournamentId, label }, select: TATAMI_SELECT });
    await recordAudit(actorUserId, "TATAMI_CREATED", "Tatami", tatami.id, { label });
    return tatami;
  } catch (error) {
    if (typeof error === "object" && error !== null && (error as { code?: string }).code === "P2002") {
      throw new ConflictError(`A tatami named "${label}" already exists for this tournament.`);
    }
    throw error;
  }
}

/** Public — anyone can see what tatamis exist and their current status; no assignment/schedule detail here. */
export async function listTatamis(tournamentId: string) {
  return prisma.tatami.findMany({
    where: { tournamentId },
    orderBy: { label: "asc" },
    select: TATAMI_SELECT,
  });
}

export async function transitionTatamiStatus(
  tatamiId: string,
  actorUserId: string,
  nextStatus: TatamiStatusValue,
) {
  const tatami = await prisma.tatami.findUnique({ where: { id: tatamiId }, select: TATAMI_SELECT });
  if (!tatami) {
    throw new NotFoundError("Tatami", tatamiId);
  }
  await assertCanManageTournament(tatami.tournamentId, actorUserId);
  assertValidTatamiTransition(tatami.status, nextStatus);

  const updated = await prisma.tatami.update({
    where: { id: tatamiId },
    data: { status: nextStatus },
    select: TATAMI_SELECT,
  });
  await recordAudit(actorUserId, "TATAMI_STATUS_CHANGED", "Tatami", tatamiId, {
    from: tatami.status,
    to: nextStatus,
  });
  emitCompetitionEvent({
    eventType: "TATAMI_STATUS_CHANGED",
    entityType: "Tatami",
    entityId: tatamiId,
    tournamentId: tatami.tournamentId,
    tatamiId,
    payload: { status: nextStatus, previousStatus: tatami.status },
    actorUserId,
  });
  return updated;
}

async function loadBoutForTatamiAction(boutId: string) {
  const bout = await prisma.bout.findUnique({
    where: { id: boutId },
    select: {
      id: true,
      status: true,
      round: { select: { draw: { select: { competition: { select: { tournamentId: true } } } } } },
    },
  });
  if (!bout) {
    throw new NotFoundError("Bout", boutId);
  }
  return bout;
}

/** The bout's currently-active tatami assignment, resolved from the active schedule — see scheduling.service for why BoutSchedule, not Bout.tatamiId, is authoritative. */
async function getBoutTatamiAssignment(boutId: string) {
  return prisma.boutSchedule.findFirst({
    where: { boutId, schedule: { isActive: true } },
    select: { tatamiId: true },
  });
}

/**
 * Starting a bout is purely administrative bookkeeping (who's on the mat,
 * for tatami-occupancy purposes) — no scoring, no result. Enforces the
 * tatami is actually usable and that it isn't already running another bout.
 */
export async function startBout(boutId: string, actorUserId: string) {
  const bout = await loadBoutForTatamiAction(boutId);
  await assertCanManageTournament(bout.round.draw.competition.tournamentId, actorUserId);

  const assignment = await getBoutTatamiAssignment(boutId);
  if (!assignment?.tatamiId) {
    throw new ConflictError("This bout has not been scheduled to a tatami yet.");
  }
  const tatami = await prisma.tatami.findUnique({ where: { id: assignment.tatamiId } });
  if (!tatami || tatami.status !== "ACTIVE") {
    throw new ConflictError("This bout's assigned tatami is not currently available.");
  }

  const concurrentBout = await prisma.boutSchedule.findFirst({
    where: {
      tatamiId: assignment.tatamiId,
      schedule: { isActive: true },
      boutId: { not: boutId },
      bout: { status: "IN_PROGRESS" },
    },
  });
  if (concurrentBout) {
    throw new ConflictError("Another bout is already in progress on this tatami.");
  }

  assertValidBoutTransition(bout.status, "IN_PROGRESS");
  const updated = await prisma.bout.update({
    where: { id: boutId },
    data: { status: "IN_PROGRESS", startedAt: new Date() },
  });
  await recordAudit(actorUserId, "BOUT_STARTED", "Bout", boutId, { tatamiId: assignment.tatamiId });
  return updated;
}

export async function completeBout(boutId: string, actorUserId: string) {
  const bout = await loadBoutForTatamiAction(boutId);
  await assertCanManageTournament(bout.round.draw.competition.tournamentId, actorUserId);
  assertValidBoutTransition(bout.status, "FINISHED");

  const updated = await prisma.bout.update({
    where: { id: boutId },
    data: { status: "FINISHED", endedAt: new Date() },
  });
  await recordAudit(actorUserId, "BOUT_COMPLETED", "Bout", boutId);
  return updated;
}
