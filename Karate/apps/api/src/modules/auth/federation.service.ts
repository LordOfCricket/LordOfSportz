import { prisma } from "@karate/database";
import type { UserRole } from "@karate/types";
import { issueAccessToken } from "./access-token.util";
import { createRefreshSession } from "./refresh.service";

/**
 * Federated identity: LordOfCricket is the identity provider. Disabled unless
 * CRICKET_API_URL is set. No password or session is stored here — Karate only
 * provisions a local user row (email + name) and issues its own tokens.
 */
export const cricketApiUrl = (): string | null => process.env["CRICKET_API_URL"]?.replace(/\/+$/, "") || null;

interface CricketUser {
  name: string;
  email: string | null;
}

async function cricketFetch(path: string, init: RequestInit): Promise<Response | null> {
  const base = cricketApiUrl();
  if (!base) return null;
  try {
    return await fetch(`${base}${path}`, { ...init, signal: AbortSignal.timeout(5000) });
  } catch {
    return null;
  }
}

export async function cricketLogin(identifier: string, password: string) {
  const res = await cricketFetch("/auth/login-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier, password }),
  });
  if (!res || !res.ok) return null;
  const user = ((await res.json()) as { user?: CricketUser }).user;
  const setCookie = res.headers.getSetCookie?.().find((c) => c.startsWith("loc_session="));
  if (!user?.email || !setCookie) return null;
  return { user: user as CricketUser & { email: string }, setCookie };
}

/** `sessionCookie` is the raw `loc_session=<value>` pair. */
export async function cricketMe(sessionCookie: string) {
  if (!/^loc_session=[^;\s]+$/.test(sessionCookie)) return null;
  const res = await cricketFetch("/auth/me", { headers: { Cookie: sessionCookie } });
  if (!res || !res.ok) return null;
  const user = ((await res.json()) as { user?: CricketUser }).user;
  return user?.email ? (user as CricketUser & { email: string }) : null;
}

/** Redeems a one-time LordOfCricket handoff code; the response also carries a fresh Cricket session cookie. */
export async function cricketRedeem(code: string) {
  const res = await cricketFetch("/auth/sso/redeem", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, audience: "karate" }),
  });
  if (!res || !res.ok) return null;
  const user = ((await res.json()) as { user?: CricketUser }).user;
  const setCookie = res.headers.getSetCookie?.().find((c) => c.startsWith("loc_session="));
  if (!user?.email || !setCookie) return null;
  return { user: user as CricketUser & { email: string }, setCookie };
}

export async function issueForFederatedUser(email: string, name: string) {
  const normalized = email.trim().toLowerCase();
  let user = await prisma.user.findUnique({ where: { email: normalized }, include: { roles: true } });
  if (!user) {
    user = await prisma.user.create({
      data: { email: normalized, fullName: name || normalized, roles: { create: [{ role: "PLAYER" }] } },
      include: { roles: true },
    });
  }
  if (user.status !== "ACTIVE") return null;
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  const roles = user.roles.map((r) => r.role) as UserRole[];
  return {
    userId: user.id,
    email: user.email,
    fullName: user.fullName,
    roles,
    accessToken: issueAccessToken(user.id, roles),
    refreshToken: await createRefreshSession(prisma, user.id),
  };
}
