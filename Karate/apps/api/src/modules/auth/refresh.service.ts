import { randomUUID } from "node:crypto";
import { prisma, type Prisma } from "@karate/database";
import type { UserRole } from "@karate/types";
import { AuthenticationError } from "@karate/shared";
import { loadServerEnv } from "@karate/config";
import type { Logger } from "@karate/logger";
import { issueAccessToken } from "./access-token.util";
import { generateOpaqueToken, hashOpaqueToken } from "./refresh-token.util";

export interface RefreshResult {
  userId: string;
  email: string;
  fullName: string;
  roles: UserRole[];
  accessToken: string;
  refreshToken: string;
}

/**
 * If a token that was already rotated gets presented again within this
 * window, treat it as a benign concurrent duplicate (two requests racing on
 * the same still-fresh token — e.g. two tabs, or a client retry) rather than
 * theft: the loser simply fails, and the winner's new session is left
 * alone. Outside this window, the same signal (an already-ROTATED token
 * being presented) is the strongest available evidence of real replay —
 * whoever holds it now is not who completed the legitimate rotation — so
 * the whole family is revoked. Without this distinction, ordinary
 * request races would be indistinguishable from theft and would force
 * legitimate users to re-authenticate.
 */
const REUSE_GRACE_PERIOD_MS = 5_000;

function refreshExpiryDate(): Date {
  const env = loadServerEnv();
  return new Date(Date.now() + env.JWT_REFRESH_TTL_SECONDS * 1000);
}

/** Starts a brand-new rotation chain — called from register/login only. */
export async function createRefreshSession(
  tx: Prisma.TransactionClient | typeof prisma,
  userId: string,
): Promise<string> {
  const { rawToken, tokenHash } = generateOpaqueToken();
  await tx.refreshSession.create({
    data: { userId, familyId: randomUUID(), tokenHash, expiresAt: refreshExpiryDate() },
  });
  return rawToken;
}

/**
 * Revokes every not-yet-revoked session in a rotation family. Called when a
 * refresh token is presented after it was already rotated away — the
 * strongest signal available that the token was captured and is being
 * replayed by someone other than whoever completed the legitimate rotation.
 */
async function revokeFamily(familyId: string, reason: "REUSE_DETECTED" | "LOGOUT"): Promise<void> {
  await prisma.refreshSession.updateMany({
    where: { familyId, revokedAt: null },
    data: { revokedAt: new Date(), revokedReason: reason },
  });
}

/**
 * Rotation + reuse detection. Never log `rawToken` or `tokenHash` — only
 * session/user/family IDs, which are safe (they don't let anyone reconstruct
 * the credential).
 */
export async function refreshTokens(rawToken: string, log: Logger): Promise<RefreshResult> {
  const tokenHash = hashOpaqueToken(rawToken);
  const session = await prisma.refreshSession.findUnique({ where: { tokenHash } });

  if (!session) {
    throw new AuthenticationError("Invalid refresh token.");
  }

  if (session.expiresAt < new Date()) {
    throw new AuthenticationError("Refresh token has expired. Please sign in again.");
  }

  if (session.revokedAt) {
    const withinGracePeriod =
      session.revokedReason === "ROTATED" &&
      session.rotatedAt !== null &&
      Date.now() - session.rotatedAt.getTime() < REUSE_GRACE_PERIOD_MS;

    if (session.revokedReason === "ROTATED" && !withinGracePeriod) {
      log.warn(
        { userId: session.userId, familyId: session.familyId, sessionId: session.id },
        "refresh token reuse detected — revoking session family",
      );
      await revokeFamily(session.familyId, "REUSE_DETECTED");
    }
    throw new AuthenticationError("Invalid refresh token. Please sign in again.");
  }

  return prisma.$transaction(async (tx) => {
    // Atomic claim: if two requests race on this same still-valid token,
    // only one UPDATE can flip revokedAt from null to non-null. The loser
    // sees count 0 and fails cleanly — no duplicate session, and the
    // winner's brand-new session is left untouched.
    const claim = await tx.refreshSession.updateMany({
      where: { id: session.id, revokedAt: null },
      data: { revokedAt: new Date(), rotatedAt: new Date(), revokedReason: "ROTATED" },
    });
    if (claim.count === 0) {
      throw new AuthenticationError("Invalid refresh token. Please sign in again.");
    }

    const { rawToken: newRawToken, tokenHash: newTokenHash } = generateOpaqueToken();
    const newSession = await tx.refreshSession.create({
      data: {
        userId: session.userId,
        familyId: session.familyId,
        tokenHash: newTokenHash,
        expiresAt: refreshExpiryDate(),
      },
    });
    await tx.refreshSession.update({
      where: { id: session.id },
      data: { replacedBySessionId: newSession.id },
    });

    const user = await tx.user.findUniqueOrThrow({
      where: { id: session.userId },
      include: { roles: true },
    });
    const roles = user.roles.map((r) => r.role) as UserRole[];

    log.info({ userId: user.id, familyId: session.familyId }, "refresh token rotated");

    return {
      userId: user.id,
      email: user.email,
      fullName: user.fullName,
      roles,
      accessToken: issueAccessToken(user.id, roles),
      refreshToken: newRawToken,
    };
  });
}

/** Idempotent by design: revoking an already-revoked/unknown token is a silent no-op. */
export async function logoutSession(rawToken: string): Promise<void> {
  const tokenHash = hashOpaqueToken(rawToken);
  await prisma.refreshSession.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date(), revokedReason: "LOGOUT" },
  });
}
