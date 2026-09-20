import { describe, it, expect } from "vitest";
import request from "supertest";
import { prisma } from "@karate/database";
import { buildTestApp, registerAndLogin } from "./helpers";

const app = buildTestApp();

describe("refresh token lifecycle", () => {
  it("login creates a refresh session in the database", async () => {
    const user = await registerAndLogin(app, "PLAYER");
    const sessions = await prisma.refreshSession.findMany({ where: { userId: user.userId } });
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.revokedAt).toBeNull();
  });

  it("refresh returns a new access token and a rotated refresh token", async () => {
    const user = await registerAndLogin(app, "PLAYER");

    const res = await request(app).post("/api/v1/auth/refresh").send({ refreshToken: user.refreshToken });

    expect(res.status).toBe(200);
    expect(typeof res.body.data.accessToken).toBe("string");
    expect(typeof res.body.data.refreshToken).toBe("string");
    expect(res.body.data.refreshToken).not.toBe(user.refreshToken);
  });

  it("rotation revokes the old session and marks it ROTATED", async () => {
    const user = await registerAndLogin(app, "PLAYER");
    await request(app).post("/api/v1/auth/refresh").send({ refreshToken: user.refreshToken });

    const sessions = await prisma.refreshSession.findMany({
      where: { userId: user.userId },
      orderBy: { createdAt: "asc" },
    });
    expect(sessions).toHaveLength(2);
    expect(sessions[0]?.revokedReason).toBe("ROTATED");
    expect(sessions[1]?.revokedAt).toBeNull();
  });

  it("rejects reuse of an already-rotated refresh token", async () => {
    const user = await registerAndLogin(app, "PLAYER");
    await request(app).post("/api/v1/auth/refresh").send({ refreshToken: user.refreshToken });

    const reuseRes = await request(app)
      .post("/api/v1/auth/refresh")
      .send({ refreshToken: user.refreshToken });

    expect(reuseRes.status).toBe(401);
    expect(reuseRes.body.error.code).toBe("AUTHENTICATION_ERROR");
  });

  it("reuse detection revokes the entire session family, including the current valid token", async () => {
    const user = await registerAndLogin(app, "PLAYER");
    const firstRefresh = await request(app)
      .post("/api/v1/auth/refresh")
      .send({ refreshToken: user.refreshToken });
    const rotatedToken = firstRefresh.body.data.refreshToken as string;

    // Simulate a replay well after the legitimate rotation (outside the
    // short grace period that protects benign concurrent races — see
    // REUSE_GRACE_PERIOD_MS in refresh.service.ts) so this deterministically
    // exercises the "genuine theft" path rather than the "same-millisecond
    // race" path (covered separately by the concurrency test below).
    await prisma.refreshSession.updateMany({
      where: { userId: user.userId, revokedReason: "ROTATED" },
      data: { rotatedAt: new Date(Date.now() - 60_000) },
    });

    // Replay the original (now-stale) token — this should nuke the family.
    await request(app).post("/api/v1/auth/refresh").send({ refreshToken: user.refreshToken });

    // The token issued by the legitimate rotation should now also be dead.
    const secondRefresh = await request(app)
      .post("/api/v1/auth/refresh")
      .send({ refreshToken: rotatedToken });

    expect(secondRefresh.status).toBe(401);

    const sessions = await prisma.refreshSession.findMany({ where: { userId: user.userId } });
    expect(sessions.every((s) => s.revokedAt !== null)).toBe(true);
  });

  it("does not revoke the family when a just-rotated token is replayed within the grace period", async () => {
    const user = await registerAndLogin(app, "PLAYER");
    const firstRefresh = await request(app)
      .post("/api/v1/auth/refresh")
      .send({ refreshToken: user.refreshToken });
    const winningToken = firstRefresh.body.data.refreshToken as string;

    // Immediately replay the pre-rotation token — well within the grace
    // period. This must fail, but must NOT punish the session that already
    // won the rotation.
    const raceLoser = await request(app)
      .post("/api/v1/auth/refresh")
      .send({ refreshToken: user.refreshToken });
    expect(raceLoser.status).toBe(401);

    const stillValid = await request(app).post("/api/v1/auth/refresh").send({ refreshToken: winningToken });
    expect(stillValid.status).toBe(200);
  });

  it("rejects an expired refresh token", async () => {
    const user = await registerAndLogin(app, "PLAYER");
    await prisma.refreshSession.updateMany({
      where: { userId: user.userId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const res = await request(app).post("/api/v1/auth/refresh").send({ refreshToken: user.refreshToken });

    expect(res.status).toBe(401);
    expect(res.body.error.message).toMatch(/expired/i);
  });

  it("rejects a refresh token revoked by logout", async () => {
    const user = await registerAndLogin(app, "PLAYER");
    await request(app).post("/api/v1/auth/logout").send({ refreshToken: user.refreshToken });

    const res = await request(app).post("/api/v1/auth/refresh").send({ refreshToken: user.refreshToken });

    expect(res.status).toBe(401);
  });

  it("rejects an invalid/unknown refresh credential", async () => {
    const res = await request(app)
      .post("/api/v1/auth/refresh")
      .send({ refreshToken: "a".repeat(40) });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("AUTHENTICATION_ERROR");
  });

  it("recovers from access-token expiry via refresh", async () => {
    const user = await registerAndLogin(app, "PLAYER");
    const meWithOldToken = await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${user.accessToken}`);
    expect(meWithOldToken.status).toBe(200);

    const refreshRes = await request(app)
      .post("/api/v1/auth/refresh")
      .send({ refreshToken: user.refreshToken });
    const meWithNewToken = await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${refreshRes.body.data.accessToken}`);

    expect(meWithNewToken.status).toBe(200);
    expect(meWithNewToken.body.data.userId).toBe(user.userId);
  });

  describe("logout", () => {
    it("revokes the refresh session", async () => {
      const user = await registerAndLogin(app, "PLAYER");
      const res = await request(app).post("/api/v1/auth/logout").send({ refreshToken: user.refreshToken });
      expect(res.status).toBe(200);
      expect(res.body.data.loggedOut).toBe(true);

      const session = await prisma.refreshSession.findFirst({ where: { userId: user.userId } });
      expect(session?.revokedAt).not.toBeNull();
      expect(session?.revokedReason).toBe("LOGOUT");
    });

    it("is safe to call a second time", async () => {
      const user = await registerAndLogin(app, "PLAYER");
      await request(app).post("/api/v1/auth/logout").send({ refreshToken: user.refreshToken });

      const secondRes = await request(app)
        .post("/api/v1/auth/logout")
        .send({ refreshToken: user.refreshToken });

      expect(secondRes.status).toBe(200);
      expect(secondRes.body.data.loggedOut).toBe(true);
    });
  });

  it("does not let one user's refresh token be affected by another user's session activity", async () => {
    const userA = await registerAndLogin(app, "PLAYER");
    const userB = await registerAndLogin(app, "PLAYER");

    await request(app).post("/api/v1/auth/refresh").send({ refreshToken: userA.refreshToken });

    // userB's original session must be completely unaffected by userA's rotation.
    const res = await request(app).post("/api/v1/auth/refresh").send({ refreshToken: userB.refreshToken });
    expect(res.status).toBe(200);
  });

  it("handles concurrent refresh attempts on the same token without creating two valid sessions", async () => {
    const user = await registerAndLogin(app, "PLAYER");

    const [first, second] = await Promise.all([
      request(app).post("/api/v1/auth/refresh").send({ refreshToken: user.refreshToken }),
      request(app).post("/api/v1/auth/refresh").send({ refreshToken: user.refreshToken }),
    ]);

    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([200, 401]);

    const unrevokedSessions = await prisma.refreshSession.findMany({
      where: { userId: user.userId, revokedAt: null },
    });
    expect(unrevokedSessions).toHaveLength(1);
  });

  it("rejects malformed refresh input", async () => {
    const res = await request(app).post("/api/v1/auth/refresh").send({ refreshToken: "short" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});
