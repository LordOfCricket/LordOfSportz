import { prisma, type Prisma } from "@karate/database";
import type { MedicalClearanceStatusValue } from "@karate/types";
import { AuthorizationError, ConflictError, NotFoundError, ValidationError } from "@karate/shared";
import { assertValidMedicalClearanceTransition } from "../../domain/medicalClearanceLifecycle";
import {
  assertUserCanManageTournament,
  getTournamentWithOrganizer,
} from "../tournaments/tournaments.service";
import { recordAudit } from "../../lib/audit";

type Client = typeof prisma | Prisma.TransactionClient;

/** Seeded alongside every new registration — mirrors the EligibilityCheck auto-creation, so "no clearance row" never has to be treated as a distinct state from PENDING. */
export async function createInitialMedicalClearance(registrationId: string, client: Client = prisma) {
  await client.medicalClearance.create({ data: { registrationId } });
}

/**
 * A CLEARED row whose `expiresAt` has passed is no longer valid even if
 * nothing has ever explicitly transitioned it to EXPIRED (there is no
 * background job in this scope). This is the honest, always-correct status
 * — computed on every read — so nothing downstream (this phase's DTOs, or
 * Phase 9's readiness) can be misled by a stale stored value.
 */
export function resolveEffectiveStatus(
  clearance: { status: MedicalClearanceStatusValue; expiresAt: Date | null },
  now: Date = new Date(),
): MedicalClearanceStatusValue {
  if (clearance.status === "CLEARED" && clearance.expiresAt && clearance.expiresAt <= now) {
    return "EXPIRED";
  }
  return clearance.status;
}

/** Safe summary only — status + expiry + a derived validity flag. Never notes, never the verifying user. Called from a single-record read, so the opportunistic self-heal write is not an N+1 concern. */
export async function getMedicalSummary(registrationId: string) {
  const clearance = await prisma.medicalClearance.findUnique({ where: { registrationId } });
  if (!clearance) {
    return { status: "PENDING" as const, expiresAt: null, isValid: false };
  }
  const effectiveStatus = resolveEffectiveStatus(clearance);
  if (effectiveStatus !== clearance.status) {
    await prisma.medicalClearance.update({ where: { registrationId }, data: { status: effectiveStatus } });
  }
  return { status: effectiveStatus, expiresAt: clearance.expiresAt, isValid: effectiveStatus === "CLEARED" };
}

const DECIDABLE_STATUSES: MedicalClearanceStatusValue[] = ["CLEARED", "NOT_CLEARED"];

/**
 * Authorized decision — reserved for the tournament ORGANIZER, the same
 * competition-integrity authority as eligibility overrides (Phase 7).
 * Players can never reach this path; there is no route that exposes it to
 * them. Audited with the actor and the resulting status only — never the
 * note content, which may carry sensitive context even though it must never
 * hold raw medical detail.
 */
export async function recordMedicalDecision(
  registrationId: string,
  actorUserId: string,
  status: MedicalClearanceStatusValue,
  notes: string | undefined,
  expiresAt: Date | undefined,
) {
  if (!DECIDABLE_STATUSES.includes(status)) {
    throw new ValidationError(`Cannot record a medical decision of ${status}.`);
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

  const existing = await prisma.medicalClearance.findUnique({ where: { registrationId } });
  if (!existing) {
    throw new ConflictError("This registration has no medical clearance record.");
  }
  assertValidMedicalClearanceTransition(existing.status, status);

  const updated = await prisma.medicalClearance.update({
    where: { registrationId },
    data: {
      status,
      notes: notes ?? null,
      expiresAt: expiresAt ?? null,
      verifiedByUserId: actorUserId,
      verifiedAt: new Date(),
    },
  });
  await recordAudit(actorUserId, "MEDICAL_CLEARANCE_RECORDED", "Registration", registrationId, { status });
  return { status: updated.status, expiresAt: updated.expiresAt, isValid: updated.status === "CLEARED" };
}

/** Read-side authorization mirrors registration access — the player themselves, the representing academy, or the submitting actor. Never the notes field, regardless of who is asking. */
export async function assertCanViewMedicalSummary(
  registrationId: string,
  actorUserId: string,
): Promise<void> {
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
