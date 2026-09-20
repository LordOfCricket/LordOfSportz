import { prisma } from "@karate/database";
import type { OfficialFunction } from "@karate/types";
import { AuthorizationError, ConflictError, NotFoundError } from "@karate/shared";
import { assertValidOfficialAssignmentTransition } from "../../domain/officialAssignmentLifecycle";
import {
  assertUserCanManageTournament,
  getTournamentWithOrganizer,
} from "../tournaments/tournaments.service";
import { recordAudit } from "../../lib/audit";
import { emitCompetitionEvent } from "../../lib/realtime";

interface AssignOfficialInput {
  scorerProfileId: string;
  function: OfficialFunction;
  tatamiId?: string;
  competitionId?: string;
  startAt?: Date;
  endAt?: Date;
}

const ASSIGNMENT_SELECT = {
  id: true,
  tournamentId: true,
  competitionId: true,
  tatamiId: true,
  scorerProfileId: true,
  function: true,
  status: true,
  startAt: true,
  endAt: true,
  assignedByUserId: true,
  assignedAt: true,
} as const;

async function assertCanManageTournament(tournamentId: string, actorUserId: string) {
  const tournament = await getTournamentWithOrganizer(tournamentId);
  await assertUserCanManageTournament(tournament, actorUserId);
  return tournament;
}

function windowsOverlap(
  aStart: Date | null,
  aEnd: Date | null,
  bStart: Date | null,
  bEnd: Date | null,
): boolean {
  // Undated assignments (no window given) are treated as spanning the whole tournament — always conflicting.
  if (!aStart || !aEnd || !bStart || !bEnd) return true;
  return aStart < bEnd && bStart < aEnd;
}

/**
 * Organizer-only — a scorer can never assign themselves (no route exposes
 * this to them). Prevents the three concrete conflicts the spec calls out:
 * the same scorer double-booked across overlapping windows regardless of
 * tatami/function, assignment to a CLOSED tatami, and assignment after the
 * tournament has been finalized (unless explicitly forced).
 */
export async function assignOfficial(
  tournamentId: string,
  actorUserId: string,
  input: AssignOfficialInput,
  force = false,
) {
  await assertCanManageTournament(tournamentId, actorUserId);

  const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId } });
  if (!tournament) {
    throw new NotFoundError("Tournament", tournamentId);
  }
  const finalizedStatuses = ["COMPLETED", "RESULTS_FINALIZED", "ARCHIVED"];
  if (finalizedStatuses.includes(tournament.status) && !force) {
    throw new ConflictError(
      `This tournament is ${tournament.status}. Pass force=true to make an explicitly authorized assignment.`,
    );
  }

  const scorer = await prisma.scorerProfile.findUnique({ where: { id: input.scorerProfileId } });
  if (!scorer) {
    throw new NotFoundError("Scorer profile", input.scorerProfileId);
  }
  if (scorer.verificationStatus !== "VERIFIED") {
    throw new ConflictError("Only a VERIFIED scorer can be assigned an official function.");
  }

  if (input.tatamiId) {
    const tatami = await prisma.tatami.findUnique({ where: { id: input.tatamiId } });
    if (!tatami || tatami.tournamentId !== tournamentId) {
      throw new NotFoundError("Tatami", input.tatamiId);
    }
    if (tatami.status === "CLOSED") {
      throw new ConflictError("This tatami is closed and cannot receive new assignments.");
    }
  }

  if (input.competitionId) {
    const competition = await prisma.competition.findUnique({ where: { id: input.competitionId } });
    if (!competition || competition.tournamentId !== tournamentId) {
      throw new NotFoundError("Competition", input.competitionId);
    }
  }

  // Same scorer, any tournament, any function/tatami — an overlapping active assignment is always a conflict.
  const existingActive = await prisma.officialAssignment.findMany({
    where: { scorerProfileId: input.scorerProfileId, status: { in: ["ASSIGNED", "CONFIRMED"] } },
  });
  const conflict = existingActive.find((a) =>
    windowsOverlap(a.startAt, a.endAt, input.startAt ?? null, input.endAt ?? null),
  );
  if (conflict) {
    throw new ConflictError(
      "This scorer already has an overlapping active assignment (same or different tatami/function).",
    );
  }

  const created = await prisma.officialAssignment.create({
    data: {
      tournamentId,
      competitionId: input.competitionId,
      tatamiId: input.tatamiId,
      scorerProfileId: input.scorerProfileId,
      function: input.function,
      startAt: input.startAt,
      endAt: input.endAt,
      assignedByUserId: actorUserId,
    },
    select: ASSIGNMENT_SELECT,
  });
  await recordAudit(actorUserId, "OFFICIAL_ASSIGNED", "OfficialAssignment", created.id, {
    scorerProfileId: input.scorerProfileId,
    function: input.function,
  });
  emitCompetitionEvent({
    eventType: "OFFICIAL_ASSIGNMENT_CHANGED",
    entityType: "OfficialAssignment",
    entityId: created.id,
    tournamentId,
    competitionId: input.competitionId,
    tatamiId: input.tatamiId,
    payload: { assignment: created },
    actorUserId,
  });
  return created;
}

async function loadAssignmentOrThrow(assignmentId: string) {
  const assignment = await prisma.officialAssignment.findUnique({
    where: { id: assignmentId },
    select: ASSIGNMENT_SELECT,
  });
  if (!assignment) {
    throw new NotFoundError("Official assignment", assignmentId);
  }
  return assignment;
}

export async function transitionAssignmentStatus(
  assignmentId: string,
  actorUserId: string,
  nextStatus: "CONFIRMED" | "DECLINED" | "COMPLETED" | "REVOKED",
) {
  const assignment = await loadAssignmentOrThrow(assignmentId);
  await assertCanManageTournament(assignment.tournamentId, actorUserId);
  assertValidOfficialAssignmentTransition(assignment.status, nextStatus);

  const updated = await prisma.officialAssignment.update({
    where: { id: assignmentId },
    data: { status: nextStatus },
    select: ASSIGNMENT_SELECT,
  });
  await recordAudit(actorUserId, "OFFICIAL_ASSIGNMENT_STATUS_CHANGED", "OfficialAssignment", assignmentId, {
    from: assignment.status,
    to: nextStatus,
  });
  return updated;
}

export async function listTournamentAssignments(tournamentId: string, actorUserId: string) {
  await assertCanManageTournament(tournamentId, actorUserId);
  return prisma.officialAssignment.findMany({
    where: { tournamentId },
    orderBy: { assignedAt: "desc" },
    select: { ...ASSIGNMENT_SELECT, scorerProfile: { select: { id: true, displayName: true } } },
  });
}

/** A scorer may only ever read their own assignments — never another scorer's, regardless of role. */
export async function listMyAssignments(actorUserId: string) {
  const scorerProfile = await prisma.scorerProfile.findUnique({ where: { userId: actorUserId } });
  if (!scorerProfile) {
    throw new NotFoundError("Scorer profile");
  }
  return prisma.officialAssignment.findMany({
    where: { scorerProfileId: scorerProfile.id },
    orderBy: { assignedAt: "desc" },
    select: {
      ...ASSIGNMENT_SELECT,
      tournament: { select: { id: true, name: true, slug: true } },
      tatami: { select: { id: true, label: true } },
    },
  });
}

export async function getAssignmentForScorer(assignmentId: string, actorUserId: string) {
  const assignment = await prisma.officialAssignment.findUnique({
    where: { id: assignmentId },
    include: { scorerProfile: { select: { userId: true } } },
  });
  if (!assignment) {
    throw new NotFoundError("Official assignment", assignmentId);
  }
  if (assignment.scorerProfile.userId !== actorUserId) {
    throw new AuthorizationError("You do not have access to this assignment.");
  }
  return assignment;
}
