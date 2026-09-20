import { prisma } from "@karate/database";
import type { RecordWeighInRequest } from "@karate/validation";
import { NotFoundError } from "@karate/shared";
import {
  assertUserCanManageTournament,
  getTournamentWithOrganizer,
} from "../tournaments/tournaments.service";
import { runEligibilityEvaluation } from "./eligibility.service";
import { recordAudit } from "../../lib/audit";

const LB_TO_KG = 0.45359237;

function toKg(weight: number, unit: "KG" | "LB"): number {
  return unit === "LB" ? Math.round(weight * LB_TO_KG * 100) / 100 : weight;
}

async function nextAttemptNumber(registrationId: string): Promise<number> {
  const last = await prisma.weighInAttempt.findFirst({
    where: { registrationId },
    orderBy: { attemptNumber: "desc" },
    select: { attemptNumber: true },
  });
  return (last?.attemptNumber ?? 0) + 1;
}

async function loadRegistrationForWeighIn(registrationId: string) {
  const registration = await prisma.registration.findUnique({
    where: { id: registrationId },
    include: { competition: { select: { tournamentId: true, category: true } } },
  });
  if (!registration) {
    throw new NotFoundError("Registration", registrationId);
  }
  return registration;
}

/**
 * Records one official weigh-in attempt. Never trusts a client-supplied
 * pass/fail — the server always computes `status` from the measured weight
 * against the competition's category bounds (the same fields the
 * eligibility engine already reads, not a duplicated rule). Previous
 * attempts are never touched; this only ever inserts.
 */
export async function recordWeighInAttempt(
  registrationId: string,
  actorUserId: string,
  input: RecordWeighInRequest,
) {
  const registration = await loadRegistrationForWeighIn(registrationId);
  const tournament = await getTournamentWithOrganizer(registration.competition.tournamentId);
  await assertUserCanManageTournament(tournament, actorUserId);

  const measuredWeightKg = toKg(input.measuredWeight, input.unit);
  const { weightMinKg, weightMaxKg } = registration.competition.category;
  const withinLimit =
    (weightMinKg == null || measuredWeightKg >= Number(weightMinKg)) &&
    (weightMaxKg == null || measuredWeightKg <= Number(weightMaxKg));

  const attemptNumber = await nextAttemptNumber(registrationId);
  const attempt = await prisma.weighInAttempt.create({
    data: {
      registrationId,
      attemptNumber,
      measuredWeightKg,
      unit: input.unit,
      status: withinLimit ? "PASSED" : "FAILED",
      verifiedByUserId: actorUserId,
    },
  });

  await recordAudit(actorUserId, "WEIGH_IN_RECORDED", "Registration", registrationId, {
    attemptNumber,
    status: attempt.status,
  });

  // The freshly-measured weight is now the authoritative input the
  // eligibility engine's weight rule should use — re-running it here keeps
  // the two domains consistent without eligibility ever having to poll or
  // duplicate this logic itself.
  await runEligibilityEvaluation(registrationId);

  return toAttemptDto(attempt);
}

/** A pure procedural call ("this reading is inconclusive, redo it") — never a pass/fail claim, so it never touches eligibility. */
export async function requestReweigh(registrationId: string, actorUserId: string, reason: string) {
  const registration = await loadRegistrationForWeighIn(registrationId);
  const tournament = await getTournamentWithOrganizer(registration.competition.tournamentId);
  await assertUserCanManageTournament(tournament, actorUserId);

  const attemptNumber = await nextAttemptNumber(registrationId);
  const attempt = await prisma.weighInAttempt.create({
    data: {
      registrationId,
      attemptNumber,
      status: "REWEIGH_REQUIRED",
      reason,
      verifiedByUserId: actorUserId,
    },
  });
  await recordAudit(actorUserId, "WEIGH_IN_REWEIGH_REQUESTED", "Registration", registrationId, {
    attemptNumber,
  });
  return toAttemptDto(attempt);
}

function toAttemptDto(attempt: {
  id: string;
  attemptNumber: number;
  measuredWeightKg: unknown;
  unit: string;
  status: string;
  reason: string | null;
  measuredAt: Date;
}) {
  return {
    id: attempt.id,
    attemptNumber: attempt.attemptNumber,
    measuredWeightKg: attempt.measuredWeightKg === null ? null : Number(attempt.measuredWeightKg),
    unit: attempt.unit,
    status: attempt.status,
    reason: attempt.reason,
    measuredAt: attempt.measuredAt,
  };
}

/** Full attempt history, oldest first — nothing is ever hidden or destroyed, per the append-only requirement. */
export async function getWeighInHistory(registrationId: string) {
  const attempts = await prisma.weighInAttempt.findMany({
    where: { registrationId },
    orderBy: { attemptNumber: "asc" },
  });
  return attempts.map(toAttemptDto);
}

/** The latest attempt is the only one eligibility/readiness ever look at — earlier ones are history, not the current fact. */
export async function getLatestWeighInAttempt(registrationId: string) {
  const attempt = await prisma.weighInAttempt.findFirst({
    where: { registrationId },
    orderBy: { attemptNumber: "desc" },
  });
  return attempt ? toAttemptDto(attempt) : null;
}
