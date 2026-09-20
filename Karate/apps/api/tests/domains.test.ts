import { describe, it, expect } from "vitest";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { prisma } from "@karate/database";
import { buildTestApp, registerAndLogin, createAcademyWithOrganizer } from "./helpers";

const app = buildTestApp();

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

describe("player profile", () => {
  it("creates a player profile", async () => {
    const player = await registerAndLogin(app, "PLAYER");
    const res = await request(app)
      .post("/api/v1/players/profile")
      .set(auth(player.accessToken))
      .send({ displayName: "Test Player", dateOfBirth: "2005-01-01", gender: "MALE" });

    expect(res.status).toBe(201);
    expect(res.body.data.displayName).toBe("Test Player");
    expect(res.body.data.status).toBe("ACTIVE");
  });

  it("blocks duplicate player profile creation", async () => {
    const player = await registerAndLogin(app, "PLAYER");
    await request(app)
      .post("/api/v1/players/profile")
      .set(auth(player.accessToken))
      .send({ displayName: "Test Player", dateOfBirth: "2005-01-01", gender: "MALE" });

    const res = await request(app)
      .post("/api/v1/players/profile")
      .set(auth(player.accessToken))
      .send({ displayName: "Test Player 2", dateOfBirth: "2005-01-01", gender: "MALE" });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CONFLICT");
  });
});

describe("coach profile", () => {
  it("creates a coach profile", async () => {
    const coach = await registerAndLogin(app, "COACH");
    const res = await request(app)
      .post("/api/v1/coaches/profile")
      .set(auth(coach.accessToken))
      .send({ displayName: "Test Coach" });

    expect(res.status).toBe(201);
    expect(res.body.data.displayName).toBe("Test Coach");
  });

  it("blocks duplicate coach profile creation", async () => {
    const coach = await registerAndLogin(app, "COACH");
    await request(app)
      .post("/api/v1/coaches/profile")
      .set(auth(coach.accessToken))
      .send({ displayName: "C" });

    const res = await request(app)
      .post("/api/v1/coaches/profile")
      .set(auth(coach.accessToken))
      .send({ displayName: "C2" });

    expect(res.status).toBe(409);
  });
});

describe("scorer profile", () => {
  it("creates a scorer profile", async () => {
    const scorer = await registerAndLogin(app, "SCORER");
    const res = await request(app)
      .post("/api/v1/scorers/profile")
      .set(auth(scorer.accessToken))
      .send({ displayName: "Test Scorer" });

    expect(res.status).toBe(201);
    expect(res.body.data.verificationStatus).toBe("UNVERIFIED");
  });
});

describe("academy", () => {
  it("creates an academy", async () => {
    const owner = await registerAndLogin(app, "ACADEMY");
    const res = await request(app)
      .post("/api/v1/academies")
      .set(auth(owner.accessToken))
      .send({ name: "Searchable Dojo" });

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe("PENDING_VERIFICATION");
  });

  it("finds academies via search", async () => {
    const owner = await registerAndLogin(app, "ACADEMY");
    const { academy } = await createAcademyWithOrganizer(owner.userId);
    // A unique name per run — a fixed literal here would accumulate duplicate rows
    // across repeated test runs against the same persistent test database, making
    // this test order/pagination-dependent instead of deterministic.
    const uniqueName = `Unique Search Dojo ${randomUUID()}`;
    await prisma.academy.update({ where: { id: academy.id }, data: { name: uniqueName } });

    const res = await request(app).get("/api/v1/academies").query({ q: uniqueName });

    expect(res.status).toBe(200);
    expect(res.body.data.items.some((a: { id: string }) => a.id === academy.id)).toBe(true);
  });
});

describe("coach -> academy invitation", () => {
  it("coach sends an invitation", async () => {
    const owner = await registerAndLogin(app, "ACADEMY");
    const { academy } = await createAcademyWithOrganizer(owner.userId);
    const coach = await registerAndLogin(app, "COACH");
    await request(app)
      .post("/api/v1/coaches/profile")
      .set(auth(coach.accessToken))
      .send({ displayName: "C" });

    const res = await request(app)
      .post(`/api/v1/academies/${academy.id}/membership-requests`)
      .set(auth(coach.accessToken))
      .send({ message: "Let me in" });

    expect(res.status).toBe(201);
    expect(res.body.data.targetType).toBe("COACH");
    expect(res.body.data.status).toBe("PENDING");
  });

  it("blocks a duplicate pending invitation", async () => {
    const owner = await registerAndLogin(app, "ACADEMY");
    const { academy } = await createAcademyWithOrganizer(owner.userId);
    const coach = await registerAndLogin(app, "COACH");
    await request(app)
      .post("/api/v1/coaches/profile")
      .set(auth(coach.accessToken))
      .send({ displayName: "C" });

    await request(app)
      .post(`/api/v1/academies/${academy.id}/membership-requests`)
      .set(auth(coach.accessToken))
      .send({});
    const res = await request(app)
      .post(`/api/v1/academies/${academy.id}/membership-requests`)
      .set(auth(coach.accessToken))
      .send({});

    expect(res.status).toBe(409);
  });

  it("academy accepts the invitation and creates an active affiliation", async () => {
    const owner = await registerAndLogin(app, "ACADEMY");
    const { academy } = await createAcademyWithOrganizer(owner.userId);
    const coach = await registerAndLogin(app, "COACH");
    await request(app)
      .post("/api/v1/coaches/profile")
      .set(auth(coach.accessToken))
      .send({ displayName: "C" });
    const invite = await request(app)
      .post(`/api/v1/academies/${academy.id}/membership-requests`)
      .set(auth(coach.accessToken))
      .send({});

    const res = await request(app)
      .post(`/api/v1/academies/${academy.id}/membership-requests/resolve`)
      .set(auth(owner.accessToken))
      .send({ requestId: invite.body.data.id, action: "ACCEPT" });

    expect(res.status).toBe(200);
    expect(res.body.data.membership.status).toBe("ACTIVE");
  });

  it("academy rejects the invitation with no membership created", async () => {
    const owner = await registerAndLogin(app, "ACADEMY");
    const { academy } = await createAcademyWithOrganizer(owner.userId);
    const coach = await registerAndLogin(app, "COACH");
    await request(app)
      .post("/api/v1/coaches/profile")
      .set(auth(coach.accessToken))
      .send({ displayName: "C" });
    const invite = await request(app)
      .post(`/api/v1/academies/${academy.id}/membership-requests`)
      .set(auth(coach.accessToken))
      .send({});

    const res = await request(app)
      .post(`/api/v1/academies/${academy.id}/membership-requests/resolve`)
      .set(auth(owner.accessToken))
      .send({ requestId: invite.body.data.id, action: "REJECT" });

    expect(res.status).toBe(200);
    expect(res.body.data.membership).toBeNull();

    const affiliations = await prisma.academyCoachAffiliation.findMany({ where: { academyId: academy.id } });
    expect(affiliations).toHaveLength(0);
  });

  it("blocks another academy's admin from acting on this academy's requests", async () => {
    const owner = await registerAndLogin(app, "ACADEMY");
    const { academy } = await createAcademyWithOrganizer(owner.userId);
    const coach = await registerAndLogin(app, "COACH");
    await request(app)
      .post("/api/v1/coaches/profile")
      .set(auth(coach.accessToken))
      .send({ displayName: "C" });
    const invite = await request(app)
      .post(`/api/v1/academies/${academy.id}/membership-requests`)
      .set(auth(coach.accessToken))
      .send({});

    const otherOwner = await registerAndLogin(app, "ACADEMY");
    await createAcademyWithOrganizer(otherOwner.userId);

    const res = await request(app)
      .post(`/api/v1/academies/${academy.id}/membership-requests/resolve`)
      .set(auth(otherOwner.accessToken))
      .send({ requestId: invite.body.data.id, action: "ACCEPT" });

    expect(res.status).toBe(403);
  });

  it("blocks a non-coach/player role from sending a membership request", async () => {
    const owner = await registerAndLogin(app, "ACADEMY");
    const { academy } = await createAcademyWithOrganizer(owner.userId);
    const otherAcademyUser = await registerAndLogin(app, "ACADEMY");

    const res = await request(app)
      .post(`/api/v1/academies/${academy.id}/membership-requests`)
      .set(auth(otherAcademyUser.accessToken))
      .send({});

    expect(res.status).toBe(403);
  });
});

describe("membership lifecycle and history", () => {
  it("creates an active membership correctly", async () => {
    const owner = await registerAndLogin(app, "ACADEMY");
    const { academy } = await createAcademyWithOrganizer(owner.userId);
    const player = await registerAndLogin(app, "PLAYER");
    await request(app)
      .post("/api/v1/players/profile")
      .set(auth(player.accessToken))
      .send({ displayName: "P", dateOfBirth: "2005-01-01", gender: "MALE" });
    const invite = await request(app)
      .post(`/api/v1/academies/${academy.id}/membership-requests`)
      .set(auth(player.accessToken))
      .send({});
    const res = await request(app)
      .post(`/api/v1/academies/${academy.id}/membership-requests/resolve`)
      .set(auth(owner.accessToken))
      .send({ requestId: invite.body.data.id, action: "ACCEPT" });

    expect(res.body.data.membership.status).toBe("ACTIVE");
  });

  it("blocks a duplicate active membership at the database level", async () => {
    const owner = await registerAndLogin(app, "ACADEMY");
    const { academy } = await createAcademyWithOrganizer(owner.userId);
    const player = await registerAndLogin(app, "PLAYER");
    const profileRes = await request(app)
      .post("/api/v1/players/profile")
      .set(auth(player.accessToken))
      .send({ displayName: "P", dateOfBirth: "2005-01-01", gender: "MALE" });

    await prisma.academyPlayerMembership.create({
      data: {
        academyId: academy.id,
        playerId: profileRes.body.data.id,
        status: "ACTIVE",
        startedAt: new Date(),
      },
    });

    await expect(
      prisma.academyPlayerMembership.create({
        data: {
          academyId: academy.id,
          playerId: profileRes.body.data.id,
          status: "ACTIVE",
          startedAt: new Date(),
        },
      }),
    ).rejects.toThrow();
  });

  it("preserves history when a player leaves an academy", async () => {
    const owner = await registerAndLogin(app, "ACADEMY");
    const { academy } = await createAcademyWithOrganizer(owner.userId);
    const player = await registerAndLogin(app, "PLAYER");
    const profileRes = await request(app)
      .post("/api/v1/players/profile")
      .set(auth(player.accessToken))
      .send({ displayName: "P", dateOfBirth: "2005-01-01", gender: "MALE" });

    const membership = await prisma.academyPlayerMembership.create({
      data: {
        academyId: academy.id,
        playerId: profileRes.body.data.id,
        status: "ACTIVE",
        startedAt: new Date(),
      },
    });
    await prisma.academyPlayerMembership.update({
      where: { id: membership.id },
      data: { status: "LEFT", endedAt: new Date() },
    });

    const rows = await prisma.academyPlayerMembership.findMany({
      where: { playerId: profileRes.body.data.id },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe("LEFT");
  });

  it("preserves history across a transfer to a new academy", async () => {
    const ownerA = await registerAndLogin(app, "ACADEMY");
    const { academy: academyA } = await createAcademyWithOrganizer(ownerA.userId);
    const ownerB = await registerAndLogin(app, "ACADEMY");
    const { academy: academyB } = await createAcademyWithOrganizer(ownerB.userId);
    const player = await registerAndLogin(app, "PLAYER");
    const profileRes = await request(app)
      .post("/api/v1/players/profile")
      .set(auth(player.accessToken))
      .send({ displayName: "P", dateOfBirth: "2005-01-01", gender: "MALE" });
    const playerId = profileRes.body.data.id;

    const oldMembership = await prisma.academyPlayerMembership.create({
      data: { academyId: academyA.id, playerId, status: "ACTIVE", startedAt: new Date() },
    });
    await prisma.academyPlayerMembership.update({
      where: { id: oldMembership.id },
      data: { status: "TRANSFERRED", endedAt: new Date() },
    });
    await prisma.academyPlayerMembership.create({
      data: {
        academyId: academyB.id,
        playerId,
        status: "ACTIVE",
        startedAt: new Date(),
        previousMembershipId: oldMembership.id,
      },
    });

    const rows = await prisma.academyPlayerMembership.findMany({
      where: { playerId },
      orderBy: { requestedAt: "asc" },
    });
    expect(rows).toHaveLength(2);
    expect(rows[0]?.status).toBe("TRANSFERRED");
    expect(rows[1]?.status).toBe("ACTIVE");
    expect(rows[1]?.academyId).toBe(academyB.id);
  });

  it("preserves history when a coach affiliation is suspended", async () => {
    const owner = await registerAndLogin(app, "ACADEMY");
    const { academy } = await createAcademyWithOrganizer(owner.userId);
    const coach = await registerAndLogin(app, "COACH");
    const profileRes = await request(app)
      .post("/api/v1/coaches/profile")
      .set(auth(coach.accessToken))
      .send({ displayName: "C" });

    const affiliation = await prisma.academyCoachAffiliation.create({
      data: {
        academyId: academy.id,
        coachId: profileRes.body.data.id,
        status: "ACTIVE",
        startedAt: new Date(),
      },
    });
    await prisma.academyCoachAffiliation.update({
      where: { id: affiliation.id },
      data: { status: "SUSPENDED" },
    });

    const rows = await prisma.academyCoachAffiliation.findMany({
      where: { coachId: profileRes.body.data.id },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe("SUSPENDED");
  });

  it("supports the player academy join-request flow end to end", async () => {
    const owner = await registerAndLogin(app, "ACADEMY");
    const { academy } = await createAcademyWithOrganizer(owner.userId);
    const player = await registerAndLogin(app, "PLAYER");
    await request(app)
      .post("/api/v1/players/profile")
      .set(auth(player.accessToken))
      .send({ displayName: "P", dateOfBirth: "2005-01-01", gender: "MALE" });

    const requestRes = await request(app)
      .post(`/api/v1/academies/${academy.id}/membership-requests`)
      .set(auth(player.accessToken))
      .send({ message: "please" });
    expect(requestRes.body.data.targetType).toBe("PLAYER");

    const pending = await request(app)
      .get(`/api/v1/academies/${academy.id}/membership-requests`)
      .set(auth(owner.accessToken));
    expect(pending.status).toBe(200);
    expect(pending.body.data).toHaveLength(1);

    const resolveRes = await request(app)
      .post(`/api/v1/academies/${academy.id}/membership-requests/resolve`)
      .set(auth(owner.accessToken))
      .send({ requestId: requestRes.body.data.id, action: "ACCEPT" });
    expect(resolveRes.body.data.membership.status).toBe("ACTIVE");
  });

  it("blocks a non-administrator from resolving a membership request", async () => {
    const owner = await registerAndLogin(app, "ACADEMY");
    const { academy } = await createAcademyWithOrganizer(owner.userId);
    const player = await registerAndLogin(app, "PLAYER");
    await request(app)
      .post("/api/v1/players/profile")
      .set(auth(player.accessToken))
      .send({ displayName: "P", dateOfBirth: "2005-01-01", gender: "MALE" });
    const invite = await request(app)
      .post(`/api/v1/academies/${academy.id}/membership-requests`)
      .set(auth(player.accessToken))
      .send({});

    // The applicant themself is not an administrator of the academy and must not be able to self-approve.
    const res = await request(app)
      .post(`/api/v1/academies/${academy.id}/membership-requests/resolve`)
      .set(auth(player.accessToken))
      .send({ requestId: invite.body.data.id, action: "ACCEPT" });

    expect(res.status).toBe(403);
  });
});
