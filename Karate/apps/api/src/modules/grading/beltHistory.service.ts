import { prisma } from "@karate/database";
import type { VerifyBeltHistoryRequest } from "@karate/validation";
import { AuthorizationError, NotFoundError } from "@karate/shared";

const HISTORY_INCLUDE = {
  beltGrade: {
    select: { id: true, name: true, type: true, rankOrder: true, colorName: true, colorHex: true },
  },
  certificate: {
    select: {
      id: true,
      serialNumber: true,
      verificationCode: true,
      verificationStatus: true,
      issuedAt: true,
    },
  },
} as const;

export async function getBeltHistoryForPlayer(playerId: string) {
  const rows = await prisma.playerBeltHistory.findMany({
    where: { playerId },
    include: HISTORY_INCLUDE,
    orderBy: { awardedDate: "desc" },
  });
  return {
    current: rows.find((r) => r.isCurrent) ?? null,
    history: rows,
  };
}

/**
 * The single source of truth for "what grade can this player be credited
 * with right now" wherever a verified fact (not merely a claimed one) is
 * required — e.g. snapshotting a belt onto a tournament registration. A
 * belt that is merely `isCurrent` but still UNVERIFIED/PENDING/REJECTED does
 * not qualify; callers get `null` in that case rather than an unverified
 * grade silently standing in for a verified one.
 */
export async function getVerifiedCurrentGrade(playerId: string) {
  return prisma.playerBeltHistory.findFirst({
    where: { playerId, isCurrent: true, verificationStatus: "VERIFIED" },
    include: { beltGrade: { select: { id: true, name: true, type: true, rankOrder: true } } },
  });
}

/** Awards this academy issued that are still awaiting its own verification decision. */
export async function listPendingVerificationsForAcademy(academyId: string) {
  return prisma.playerBeltHistory.findMany({
    where: { awardingAcademyId: academyId, verificationStatus: "PENDING" },
    include: { beltGrade: { select: { name: true } }, player: { select: { id: true, displayName: true } } },
    orderBy: { awardedDate: "asc" },
  });
}

/**
 * Verification is a distinct, academy-authorized act from finalizing a
 * grading — an award existing (PENDING) is not the same as an academy
 * vouching for it. Only an administrator of the AWARDING academy may do
 * this; a player can never reach this path for their own record (no route
 * exposes it to them), and a different academy's admin is rejected even if
 * they somehow guess the history id.
 */
export async function verifyBeltHistory(
  historyId: string,
  actorUserId: string,
  input: VerifyBeltHistoryRequest,
) {
  const history = await prisma.playerBeltHistory.findUnique({ where: { id: historyId } });
  if (!history) {
    throw new NotFoundError("Belt history record", historyId);
  }
  if (!history.awardingAcademyId) {
    throw new AuthorizationError(
      "This record has no awarding academy and cannot be verified through this action.",
    );
  }

  const isAdmin = await prisma.academyAdministrator.findUnique({
    where: { academyId_userId: { academyId: history.awardingAcademyId, userId: actorUserId } },
  });
  if (!isAdmin) {
    throw new AuthorizationError("You do not administer the academy that awarded this grade.");
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.playerBeltHistory.update({
      where: { id: historyId },
      data: { verificationStatus: input.verificationStatus },
      include: HISTORY_INCLUDE,
    });
    if (!updated.certificateId) {
      return updated;
    }

    // `updated.certificate` above is a snapshot from before this write — a
    // second update doesn't retroactively refresh an already-fetched nested
    // relation, so the response would otherwise show the certificate's
    // stale (pre-verification) status even though the DB row is correct.
    const certificate = await tx.certificate.update({
      where: { id: updated.certificateId },
      data: { verificationStatus: input.verificationStatus },
      select: {
        id: true,
        serialNumber: true,
        verificationCode: true,
        verificationStatus: true,
        issuedAt: true,
      },
    });
    return { ...updated, certificate };
  });
}
