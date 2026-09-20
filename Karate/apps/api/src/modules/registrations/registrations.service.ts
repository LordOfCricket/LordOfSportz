import { prisma } from "@karate/database";
import type { CreateRegistrationRequest } from "@karate/validation";
import type { UserRole } from "@karate/types";
import { AuthorizationError, ConflictError, NotFoundError, ValidationError } from "@karate/shared";
import { assertValidRegistrationTransition } from "../../domain/registrationLifecycle";
import { getVerifiedCurrentGrade } from "../grading/beltHistory.service";
import { runEligibilityEvaluation } from "./eligibility.service";
import { createInitialMedicalClearance, getMedicalSummary, resolveEffectiveStatus } from "./medical.service";
import { recordAudit } from "../../lib/audit";

const REGISTRATION_INCLUDE = {
  player: { select: { id: true, displayName: true } },
  representingAcademy: { select: { id: true, name: true, slug: true } },
  beltGradeAtRegistration: { select: { id: true, name: true, type: true, rankOrder: true } },
  eligibilityCheck: { select: { status: true, reasonCodes: true, checkedAt: true, notes: true } },
  // Deliberately excludes `notes` and `verifiedByUserId` — see medical.service for why those never
  // travel through the generic registration read paths.
  medicalClearance: { select: { status: true, expiresAt: true } },
  // Only the most recent attempt — earlier ones are history, available via
  // GET /registrations/:id/weigh-in, not needed for the summary/readiness view.
  weighInAttempts: {
    orderBy: { attemptNumber: "desc" as const },
    take: 1,
    select: { status: true, measuredWeightKg: true, measuredAt: true },
  },
  competition: {
    select: {
      id: true,
      discipline: true,
      name: true,
      tournament: { select: { id: true, name: true, slug: true, status: true } },
      category: {
        select: {
          id: true,
          name: true,
          genderRestriction: true,
          ageMin: true,
          ageMax: true,
          weightMinKg: true,
          weightMaxKg: true,
        },
      },
    },
  },
} as const;

type RegistrationWithRelations = NonNullable<Awaited<ReturnType<typeof findById>>>;

function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === "P2002";
}

/**
 * Readiness is always derived from the three authoritative states, never
 * stored — a stored boolean would inevitably drift the moment any one of
 * them changes independently (a belt gets re-verified, a clearance expires,
 * a reweigh gets requested). Weigh-in only blocks readiness when the
 * category actually has a weight bound; disciplines/categories with none
 * are never held back waiting for a measurement that was never required.
 */
export function computeReadiness(
  eligibilityStatus: string,
  medicalIsValid: boolean,
  weighInApplicable: boolean,
  weighInStatus: string | null,
): { status: "READY" | "NOT_READY"; blockedBy: string[] } {
  const blockedBy: string[] = [];
  if (eligibilityStatus !== "ELIGIBLE") blockedBy.push("ELIGIBILITY");
  if (!medicalIsValid) blockedBy.push("MEDICAL");
  if (weighInApplicable && weighInStatus !== "PASSED") blockedBy.push("WEIGH_IN");
  return { status: blockedBy.length === 0 ? "READY" : "NOT_READY", blockedBy };
}

function toDto(registration: RegistrationWithRelations) {
  const eligibility = {
    status: registration.eligibilityCheck?.status ?? ("NOT_CHECKED" as const),
    reasonCodes: registration.eligibilityCheck?.reasonCodes ?? [],
    notes: registration.eligibilityCheck?.notes ?? null,
    checkedAt: registration.eligibilityCheck?.checkedAt ?? null,
  };
  const medical = registration.medicalClearance
    ? {
        status: resolveEffectiveStatus(registration.medicalClearance),
        expiresAt: registration.medicalClearance.expiresAt,
        isValid: resolveEffectiveStatus(registration.medicalClearance) === "CLEARED",
      }
    : { status: "PENDING" as const, expiresAt: null, isValid: false };
  const latestAttempt = registration.weighInAttempts[0] ?? null;
  const weighIn = {
    status: latestAttempt?.status ?? ("PENDING" as const),
    measuredWeightKg: latestAttempt?.measuredWeightKg == null ? null : Number(latestAttempt.measuredWeightKg),
    measuredAt: latestAttempt?.measuredAt ?? null,
  };
  const weighInApplicable =
    registration.competition.category.weightMinKg != null ||
    registration.competition.category.weightMaxKg != null;

  return {
    id: registration.id,
    status: registration.status,
    submittedAt: registration.submittedAt,
    updatedAt: registration.updatedAt,
    player: registration.player,
    representingAcademy: registration.representingAcademy,
    beltGradeAtRegistration: registration.beltGradeAtRegistration,
    eligibility,
    medical,
    weighIn,
    readiness: computeReadiness(eligibility.status, medical.isValid, weighInApplicable, weighIn.status),
    competition: registration.competition,
  };
}

function findById(registrationId: string) {
  return prisma.registration.findUnique({
    where: { id: registrationId },
    include: REGISTRATION_INCLUDE,
  });
}

interface RegistrationTarget {
  playerId: string;
  representingAcademyId: string | null;
}

/**
 * Resolves WHO this registration is actually for, deriving it from the
 * authenticated caller's own profiles/relationships rather than trusting a
 * client-supplied identity outright:
 *  - a PLAYER may only ever register themselves (a supplied `playerId` must
 *    match their own profile or is rejected);
 *  - a COACH/ACADEMY admin may register a player only if that player holds
 *    an ACTIVE membership at an academy the coach/admin is actively
 *    connected to — the same relationship already used for the "students"
 *    and roster views, not a new parallel concept.
 */
async function resolveRegistrationTarget(
  actorUserId: string,
  requestedPlayerId: string | undefined,
): Promise<RegistrationTarget> {
  const playerProfile = await prisma.playerProfile.findUnique({ where: { userId: actorUserId } });
  if (playerProfile) {
    if (requestedPlayerId && requestedPlayerId !== playerProfile.id) {
      throw new AuthorizationError("You can only register yourself.");
    }
    const activeMemberships = await prisma.academyPlayerMembership.findMany({
      where: { playerId: playerProfile.id, status: "ACTIVE" },
      select: { academyId: true },
    });
    return {
      playerId: playerProfile.id,
      representingAcademyId: activeMemberships.length === 1 ? activeMemberships[0]!.academyId : null,
    };
  }

  if (!requestedPlayerId) {
    throw new ValidationError("playerId is required when registering on behalf of a player.");
  }

  const player = await prisma.playerProfile.findUnique({ where: { id: requestedPlayerId } });
  if (!player) {
    throw new NotFoundError("Player", requestedPlayerId);
  }

  const coachProfile = await prisma.coachProfile.findUnique({ where: { userId: actorUserId } });
  if (coachProfile) {
    const sharedAcademy = await prisma.academyPlayerMembership.findFirst({
      where: {
        playerId: requestedPlayerId,
        status: "ACTIVE",
        academyId: {
          in: (
            await prisma.academyCoachAffiliation.findMany({
              where: { coachId: coachProfile.id, status: "ACTIVE" },
              select: { academyId: true },
            })
          ).map((a) => a.academyId),
        },
      },
      select: { academyId: true },
    });
    if (!sharedAcademy) {
      throw new AuthorizationError("You are not authorized to register this player.");
    }
    return { playerId: requestedPlayerId, representingAcademyId: sharedAcademy.academyId };
  }

  const administeredAcademyIds = (
    await prisma.academyAdministrator.findMany({
      where: { userId: actorUserId },
      select: { academyId: true },
    })
  ).map((a) => a.academyId);
  if (administeredAcademyIds.length > 0) {
    const membership = await prisma.academyPlayerMembership.findFirst({
      where: { playerId: requestedPlayerId, status: "ACTIVE", academyId: { in: administeredAcademyIds } },
      select: { academyId: true },
    });
    if (!membership) {
      throw new AuthorizationError("You are not authorized to register this player.");
    }
    return { playerId: requestedPlayerId, representingAcademyId: membership.academyId };
  }

  throw new AuthorizationError("You are not authorized to create a registration.");
}

export async function createRegistration(
  actorUserId: string,
  _actorRoles: UserRole[],
  input: CreateRegistrationRequest,
) {
  const target = await resolveRegistrationTarget(actorUserId, input.playerId);

  const competition = await prisma.competition.findUnique({
    where: { id: input.competitionId },
    include: { tournament: true, category: true },
  });
  if (!competition) {
    throw new NotFoundError("Competition", input.competitionId);
  }
  if (competition.category.tournamentId !== competition.tournamentId) {
    // Defensive only — data can never actually diverge like this through the
    // existing write paths, but a registration must never be built on a
    // category/tournament pairing that isn't actually consistent.
    throw new ConflictError("This competition's category does not belong to its tournament.");
  }

  const tournament = competition.tournament;
  if (tournament.status !== "REGISTRATION_OPEN") {
    throw new ConflictError(`This tournament is not open for registration (status: ${tournament.status}).`);
  }
  const now = new Date();
  if (tournament.registrationOpensAt && now < tournament.registrationOpensAt) {
    throw new ConflictError("Registration has not opened yet for this tournament.");
  }
  if (tournament.registrationClosesAt && now > tournament.registrationClosesAt) {
    throw new ConflictError("The registration window for this tournament has closed.");
  }

  const verifiedGrade = await getVerifiedCurrentGrade(target.playerId);

  try {
    const registrationId = await prisma.$transaction(async (tx) => {
      const created = await tx.registration.create({
        data: {
          competitionId: competition.id,
          playerId: target.playerId,
          representingAcademyId: target.representingAcademyId,
          submittedByUserId: actorUserId,
          beltGradeIdAtRegistration: verifiedGrade?.beltGradeId ?? null,
        },
      });
      // Runs inside the same transaction so a registration never exists
      // even momentarily without an eligibility outcome to show the player.
      await runEligibilityEvaluation(created.id, tx);
      await createInitialMedicalClearance(created.id, tx);
      return created.id;
    });

    await recordAudit(actorUserId, "REGISTRATION_CREATED", "Registration", registrationId, {
      competitionId: competition.id,
      playerId: target.playerId,
    });
    const registration = await findById(registrationId);
    return toDto(registration!);
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new ConflictError("This player is already registered for this competition.");
    }
    throw error;
  }
}

/** Authorization for reading/withdrawing a registration: the player themselves, the academy they registered through, or the actor who submitted it. */
async function assertCanAccessRegistration(
  registration: RegistrationWithRelations & {
    submittedByUserId: string;
    playerId: string;
    representingAcademyId: string | null;
  },
  actorUserId: string,
): Promise<void> {
  if (registration.submittedByUserId === actorUserId) return;

  const playerProfile = await prisma.playerProfile.findUnique({ where: { userId: actorUserId } });
  if (playerProfile && playerProfile.id === registration.playerId) return;

  if (registration.representingAcademyId) {
    const isAdmin = await prisma.academyAdministrator.findUnique({
      where: { academyId_userId: { academyId: registration.representingAcademyId, userId: actorUserId } },
    });
    if (isAdmin) return;
  }

  throw new AuthorizationError("You do not have access to this registration.");
}

export async function getRegistrationById(registrationId: string, actorUserId: string) {
  const registration = await findById(registrationId);
  if (!registration) {
    throw new NotFoundError("Registration", registrationId);
  }
  await assertCanAccessRegistration(registration, actorUserId);
  // Single-record read — the opportunistic expiry self-heal write here is not an N+1 concern
  // the way it would be across a list.
  const medical = await getMedicalSummary(registrationId);
  return { ...toDto(registration), medical };
}

export async function withdrawRegistration(registrationId: string, actorUserId: string) {
  const registration = await findById(registrationId);
  if (!registration) {
    throw new NotFoundError("Registration", registrationId);
  }
  await assertCanAccessRegistration(registration, actorUserId);
  assertValidRegistrationTransition(registration.status, "WITHDRAWN");

  const updated = await prisma.registration.update({
    where: { id: registrationId },
    data: { status: "WITHDRAWN" },
    include: REGISTRATION_INCLUDE,
  });
  await recordAudit(actorUserId, "REGISTRATION_WITHDRAWN", "Registration", registrationId);
  return toDto(updated);
}

export async function listMyRegistrations(actorUserId: string) {
  const playerProfile = await prisma.playerProfile.findUnique({ where: { userId: actorUserId } });
  if (!playerProfile) {
    throw new NotFoundError("Player profile");
  }
  const registrations = await prisma.registration.findMany({
    where: { playerId: playerProfile.id },
    include: REGISTRATION_INCLUDE,
    orderBy: { submittedAt: "desc" },
  });
  return registrations.map(toDto);
}

/** Registrations representing a given academy — reused by the academy-scoped route (requireAcademyAdministrator has already authorized the caller). */
export async function listAcademyRegistrations(academyId: string) {
  const registrations = await prisma.registration.findMany({
    where: { representingAcademyId: academyId },
    include: REGISTRATION_INCLUDE,
    orderBy: { submittedAt: "desc" },
  });
  return registrations.map(toDto);
}

/** Registrations for players who share an ACTIVE academy with this coach — same relationship as listMyStudentsGrades. */
export async function listMyStudentsRegistrations(actorUserId: string) {
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
  if (activeAcademyIds.length === 0) {
    return [];
  }
  const registrations = await prisma.registration.findMany({
    where: { representingAcademyId: { in: activeAcademyIds } },
    include: REGISTRATION_INCLUDE,
    orderBy: { submittedAt: "desc" },
  });
  return registrations.map(toDto);
}

/**
 * The single place that resolves "who is actually allowed into a draw" for
 * a competition — reused by the draw engine so it never re-derives
 * readiness itself (that would be a second, driftable copy of this exact
 * logic). WITHDRAWN/REJECTED registrations are excluded outright before
 * readiness is even computed; a CONFIRMED/VERIFIED/SUBMITTED registration
 * still has to be actually READY (eligible + medically cleared + weigh-in
 * satisfied where applicable) to qualify.
 */
export async function listReadyRegistrationsForCompetition(competitionId: string) {
  const registrations = await prisma.registration.findMany({
    where: { competitionId, status: { notIn: ["WITHDRAWN", "REJECTED"] } },
    include: REGISTRATION_INCLUDE,
    orderBy: { submittedAt: "asc" },
  });
  return registrations
    .map(toDto)
    .filter((r) => r.readiness.status === "READY")
    .map((r) => ({ registrationId: r.id, playerId: r.player.id, submittedAt: r.submittedAt }));
}
