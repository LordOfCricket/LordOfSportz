import { prisma, type Prisma } from "@karate/database";
import type { EligibilityStatus } from "@karate/types";
import { AuthorizationError, ConflictError, NotFoundError, ValidationError } from "@karate/shared";
import { evaluateEligibility } from "../../domain/eligibilityEngine";
import { getVerifiedCurrentGrade } from "../grading/beltHistory.service";
import {
  assertUserCanManageTournament,
  getTournamentWithOrganizer,
} from "../tournaments/tournaments.service";
import { recordAudit } from "../../lib/audit";

type Client = typeof prisma | Prisma.TransactionClient;

/**
 * Runs the pure engine against freshly-loaded, server-resolved facts and
 * upserts the result. This is the ONLY function allowed to write an
 * automatic (non-override) eligibility outcome — called right after a
 * registration is created, and again on demand via `reevaluateEligibility`.
 * Accepts an optional transaction client so registration creation can run
 * this in the same transaction as the insert.
 */
export async function runEligibilityEvaluation(registrationId: string, client: Client = prisma) {
  const registration = await client.registration.findUnique({
    where: { id: registrationId },
    include: {
      player: { select: { dateOfBirth: true, gender: true, styles: { select: { id: true } } } },
      competition: {
        select: {
          discipline: true,
          category: { include: { karateStyle: { select: { supportedDisciplines: true } } } },
        },
      },
    },
  });
  if (!registration) {
    throw new NotFoundError("Registration", registrationId);
  }

  const verifiedGrade = await getVerifiedCurrentGrade(registration.playerId);
  const category = registration.competition.category;

  // Queried directly (not through weighIn.service, which itself calls this
  // function after recording an attempt) to avoid a circular module
  // dependency between the two services. If the MOST RECENT attempt is a
  // REWEIGH_REQUIRED flag, the prior measurement is no longer authoritative
  // — treated the same as "not yet measured" until a new one is recorded,
  // never silently falling back to a reading the organizer just disputed.
  const latestAttempt = await client.weighInAttempt.findFirst({
    where: { registrationId },
    orderBy: { attemptNumber: "desc" },
    select: { status: true, measuredWeightKg: true },
  });
  const latestWeighIn =
    latestAttempt?.status === "PASSED" || latestAttempt?.status === "FAILED" ? latestAttempt : null;

  const result = evaluateEligibility({
    player: {
      dateOfBirth: registration.player.dateOfBirth,
      gender: registration.player.gender,
      styleIds: registration.player.styles.map((s) => s.id),
    },
    verifiedGradeRankOrder: verifiedGrade?.beltGrade.rankOrder ?? null,
    category: {
      genderRestriction: category.genderRestriction,
      ageMin: category.ageMin,
      ageMax: category.ageMax,
      weightMinKg: category.weightMinKg ? Number(category.weightMinKg) : null,
      weightMaxKg: category.weightMaxKg ? Number(category.weightMaxKg) : null,
      beltGradeMinOrder: category.beltGradeMinOrder,
      beltGradeMaxOrder: category.beltGradeMaxOrder,
      karateStyleId: category.karateStyleId,
    },
    competition: { discipline: registration.competition.discipline },
    styleSupportedDisciplines: category.karateStyle?.supportedDisciplines ?? [],
    officialWeightKg: latestWeighIn ? Number(latestWeighIn.measuredWeightKg) : null,
  });

  await client.eligibilityCheck.upsert({
    where: { registrationId },
    create: {
      registrationId,
      status: result.status,
      reasonCodes: result.reasonCodes,
      checkedAt: new Date(),
    },
    update: {
      status: result.status,
      reasonCodes: result.reasonCodes,
      checkedAt: new Date(),
      // An automatic re-run always clears any earlier manual override —
      // stale human judgment must not silently outlive the facts it was
      // based on. A new manual override can always be applied again.
      checkedByUserId: null,
      notes: null,
    },
  });

  return result;
}

async function assertCanTriggerReevaluation(registrationId: string, actorUserId: string): Promise<void> {
  const registration = await prisma.registration.findUnique({ where: { id: registrationId } });
  if (!registration) {
    throw new NotFoundError("Registration", registrationId);
  }
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

/** On-demand re-evaluation — a deliberate pull model instead of push hooks scattered across the belt/weigh-in/category modules, which would otherwise create circular module dependencies. */
export async function reevaluateEligibility(registrationId: string, actorUserId: string) {
  await assertCanTriggerReevaluation(registrationId, actorUserId);
  const result = await runEligibilityEvaluation(registrationId);
  await recordAudit(actorUserId, "ELIGIBILITY_REEVALUATED", "Registration", registrationId, {
    status: result.status,
    reasonCodes: result.reasonCodes,
  });
  return result;
}

const OVERRIDABLE_STATUSES: EligibilityStatus[] = ["ELIGIBLE", "INELIGIBLE", "MANUAL_REVIEW"];

/**
 * Authorized human override — reserved for the tournament ORGANIZER (not
 * the competing player's own academy, which would be a conflict of
 * interest over its own athlete's eligibility). Always audited with the
 * actor and the reason; never reachable by the player themselves.
 */
export async function overrideEligibility(
  registrationId: string,
  actorUserId: string,
  status: EligibilityStatus,
  notes: string | undefined,
) {
  if (!OVERRIDABLE_STATUSES.includes(status)) {
    throw new ValidationError(`Cannot manually set eligibility status to ${status}.`);
  }
  const registration = await prisma.registration.findUnique({
    where: { id: registrationId },
    include: { competition: { select: { tournamentId: true } } },
  });
  if (!registration) {
    throw new NotFoundError("Registration", registrationId);
  }

  const tournament = await getTournamentWithOrganizer(registration.competition.tournamentId);
  await assertUserCanManageTournament(tournament, actorUserId);

  const existing = await prisma.eligibilityCheck.findUnique({ where: { registrationId } });
  if (!existing) {
    throw new ConflictError("This registration has not been evaluated yet.");
  }

  const updated = await prisma.eligibilityCheck.update({
    where: { registrationId },
    data: { status, notes: notes ?? null, checkedByUserId: actorUserId, checkedAt: new Date() },
  });
  await recordAudit(actorUserId, "ELIGIBILITY_OVERRIDDEN", "Registration", registrationId, {
    status,
    notes,
  });
  return updated;
}
