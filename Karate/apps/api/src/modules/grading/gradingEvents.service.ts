import { prisma } from "@karate/database";
import { GRADING_EVENT_STATUS_TRANSITIONS, type GradingEventStatus } from "@karate/types";
import type {
  AddGradingParticipantRequest,
  CreateGradingEventRequest,
  RecordGradingResultRequest,
} from "@karate/validation";
import { ConflictError, NotFoundError } from "@karate/shared";
import { generateCertificateCodes } from "./certificate.util";

const EVENT_SELECT = {
  id: true,
  name: true,
  beltSystemId: true,
  hostAcademyId: true,
  examinerUserId: true,
  status: true,
  eventDate: true,
  location: true,
  notes: true,
  createdAt: true,
} as const;

const PARTICIPANT_INCLUDE = {
  player: { select: { id: true, displayName: true } },
  previousGrade: { select: { id: true, name: true, rankOrder: true } },
  targetGrade: { select: { id: true, name: true, rankOrder: true } },
} as const;

function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === "P2002";
}

/** Loads the event and confirms it belongs to the academy the caller was already authorized against. */
async function getOwnedEvent(academyId: string, eventId: string) {
  const event = await prisma.gradingEvent.findUnique({ where: { id: eventId }, select: EVENT_SELECT });
  if (!event || event.hostAcademyId !== academyId) {
    throw new NotFoundError("Grading event", eventId);
  }
  return event;
}

export async function createGradingEvent(academyId: string, input: CreateGradingEventRequest) {
  const beltSystem = await prisma.beltSystem.findUnique({ where: { id: input.beltSystemId } });
  if (!beltSystem) {
    throw new NotFoundError("Belt system", input.beltSystemId);
  }

  return prisma.gradingEvent.create({
    data: {
      name: input.name,
      beltSystemId: input.beltSystemId,
      hostAcademyId: academyId,
      examinerUserId: input.examinerUserId,
      eventDate: input.eventDate,
      location: input.location,
      notes: input.notes,
    },
    select: EVENT_SELECT,
  });
}

export async function listGradingEvents(academyId: string) {
  return prisma.gradingEvent.findMany({
    where: { hostAcademyId: academyId },
    select: EVENT_SELECT,
    orderBy: { eventDate: "desc" },
  });
}

export async function getGradingEvent(eventId: string) {
  const event = await prisma.gradingEvent.findUnique({
    where: { id: eventId },
    select: { ...EVENT_SELECT, participants: { include: PARTICIPANT_INCLUDE } },
  });
  if (!event) {
    throw new NotFoundError("Grading event", eventId);
  }
  return event;
}

/**
 * Auto-derives the player's previous grade *within this belt system* from
 * their current history entry, and enforces ordered progression: the target
 * grade's rankOrder must exceed the previous one. If the player has never
 * held a grade in ANY system yet, any target grade is allowed (first
 * grading). Player "current grade" is intentionally a single global row
 * (see PlayerBeltHistory's partial unique index) — this platform does not
 * yet track simultaneous progress across multiple belt systems per player.
 */
export async function addParticipant(
  academyId: string,
  eventId: string,
  input: AddGradingParticipantRequest,
) {
  const event = await getOwnedEvent(academyId, eventId);
  if (["COMPLETED", "FINALIZED", "CANCELLED"].includes(event.status)) {
    throw new ConflictError(`Cannot add participants once a grading event is ${event.status}.`);
  }

  const [player, targetGrade] = await Promise.all([
    prisma.playerProfile.findUnique({ where: { id: input.playerId } }),
    prisma.beltGrade.findUnique({ where: { id: input.targetGradeId } }),
  ]);
  if (!player) throw new NotFoundError("Player", input.playerId);
  if (!targetGrade || targetGrade.beltSystemId !== event.beltSystemId) {
    throw new ConflictError("The target grade does not belong to this event's belt system.");
  }

  const currentHistory = await prisma.playerBeltHistory.findFirst({
    where: { playerId: input.playerId, isCurrent: true },
    include: { beltGrade: true },
  });

  if (currentHistory?.beltGrade.id === targetGrade.id && currentHistory.verificationStatus === "VERIFIED") {
    throw new ConflictError("This player already holds a verified award of this exact grade.");
  }

  const previousGrade =
    currentHistory && currentHistory.beltGrade.beltSystemId === event.beltSystemId
      ? currentHistory.beltGrade
      : null;

  if (previousGrade && targetGrade.rankOrder <= previousGrade.rankOrder) {
    throw new ConflictError(
      `Target grade (${targetGrade.name}) must be a progression beyond the player's current grade (${previousGrade.name}).`,
    );
  }

  try {
    return await prisma.gradingParticipant.create({
      data: {
        gradingEventId: eventId,
        playerId: input.playerId,
        previousGradeId: previousGrade?.id,
        targetGradeId: targetGrade.id,
        examinerUserId: input.examinerUserId,
      },
      include: PARTICIPANT_INCLUDE,
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new ConflictError("This player is already a participant in this grading event.");
    }
    throw error;
  }
}

export async function recordResult(
  academyId: string,
  eventId: string,
  participantId: string,
  actorUserId: string,
  input: RecordGradingResultRequest,
) {
  const event = await getOwnedEvent(academyId, eventId);
  if (!["OPEN", "IN_PROGRESS"].includes(event.status)) {
    throw new ConflictError(
      `Results can only be recorded while the event is OPEN or IN_PROGRESS (currently ${event.status}).`,
    );
  }

  const participant = await prisma.gradingParticipant.findUnique({ where: { id: participantId } });
  if (!participant || participant.gradingEventId !== eventId) {
    throw new NotFoundError("Grading participant", participantId);
  }

  return prisma.gradingParticipant.update({
    where: { id: participantId },
    data: {
      result: input.result,
      remarks: input.remarks,
      decidedAt: new Date(),
      decidedByUserId: actorUserId,
    },
    include: PARTICIPANT_INCLUDE,
  });
}

/**
 * The only place a grading event's status changes. Transitioning to
 * FINALIZED is the moment PASS results become real belt awards: for each
 * PASS participant without an existing award, this flips the player's
 * current-grade pointer, inserts an immutable PlayerBeltHistory row (never
 * an update to a past one), and issues a certificate — all inside one
 * transaction per participant so a partial failure can't award a grade
 * without a certificate or vice versa. Awards start as PENDING verification;
 * a separate, academy-authorized action is required to verify them (see
 * beltHistory.service.ts) — finalizing a grading is not the same act as an
 * academy vouching for its authenticity.
 */
export async function transitionStatus(
  academyId: string,
  eventId: string,
  actorUserId: string,
  targetStatus: GradingEventStatus,
) {
  const event = await getOwnedEvent(academyId, eventId);
  const allowed = GRADING_EVENT_STATUS_TRANSITIONS[event.status as GradingEventStatus];
  if (!allowed.includes(targetStatus)) {
    throw new ConflictError(
      `Cannot move grading event from ${event.status} to ${targetStatus}. Allowed: ${
        allowed.length > 0 ? allowed.join(", ") : "none (terminal state)"
      }.`,
    );
  }

  if (targetStatus === "COMPLETED") {
    const pendingCount = await prisma.gradingParticipant.count({
      where: { gradingEventId: eventId, result: "PENDING" },
    });
    if (pendingCount > 0) {
      throw new ConflictError(`${pendingCount} participant(s) still have no recorded result.`);
    }
  }

  if (targetStatus !== "FINALIZED") {
    return prisma.gradingEvent.update({
      where: { id: eventId },
      data: { status: targetStatus },
      select: EVENT_SELECT,
    });
  }

  const passedParticipants = await prisma.gradingParticipant.findMany({
    where: { gradingEventId: eventId, result: "PASS", beltHistoryId: null },
  });

  return prisma.$transaction(async (tx) => {
    for (const participant of passedParticipants) {
      await tx.playerBeltHistory.updateMany({
        where: { playerId: participant.playerId, isCurrent: true },
        data: { isCurrent: false },
      });

      const { serialNumber, verificationCode } = generateCertificateCodes();
      const certificate = await tx.certificate.create({
        data: {
          type: "BELT_GRADING",
          playerId: participant.playerId,
          issuedByAcademyId: academyId,
          serialNumber,
          verificationCode,
          verificationStatus: "PENDING",
        },
      });

      const history = await tx.playerBeltHistory.create({
        data: {
          playerId: participant.playerId,
          beltGradeId: participant.targetGradeId,
          gradingEventId: eventId,
          awardingAcademyId: academyId,
          examinerUserId: participant.examinerUserId ?? event.examinerUserId,
          awardedDate: new Date(),
          verificationStatus: "PENDING",
          certificateId: certificate.id,
          isCurrent: true,
        },
      });

      await tx.gradingParticipant.update({
        where: { id: participant.id },
        data: {
          beltHistoryId: history.id,
          decidedAt: participant.decidedAt ?? new Date(),
          decidedByUserId: actorUserId,
        },
      });
    }

    return tx.gradingEvent.update({
      where: { id: eventId },
      data: { status: "FINALIZED" },
      select: EVENT_SELECT,
    });
  });
}
