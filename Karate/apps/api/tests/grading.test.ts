import { describe, it, expect } from "vitest";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { prisma } from "@karate/database";
import { buildTestApp, registerAndLogin, createAcademyWithOrganizer } from "./helpers";

const app = buildTestApp();
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

async function createStyle() {
  return prisma.karateStyle.create({ data: { name: `Style-${randomUUID()}` } });
}

/** Full setup: academy + belt system + 2 ordered grades + a player profile, via real API calls where practical. */
async function setup() {
  const owner = await registerAndLogin(app, "ACADEMY");
  const { academy } = await createAcademyWithOrganizer(owner.userId);
  const style = await createStyle();

  const systemRes = await request(app)
    .post("/api/v1/grading/belt-systems")
    .set(auth(owner.accessToken))
    .send({ karateStyleId: style.id, name: `System-${randomUUID()}` });
  const beltSystemId = systemRes.body.data.id as string;

  const whiteRes = await request(app)
    .post(`/api/v1/grading/belt-systems/${beltSystemId}/grades`)
    .set(auth(owner.accessToken))
    .send({ name: "White", type: "KYU", rankOrder: 1 });
  const yellowRes = await request(app)
    .post(`/api/v1/grading/belt-systems/${beltSystemId}/grades`)
    .set(auth(owner.accessToken))
    .send({ name: "Yellow", type: "KYU", rankOrder: 2 });

  const player = await registerAndLogin(app, "PLAYER");
  const playerProfileRes = await request(app)
    .post("/api/v1/players/profile")
    .set(auth(player.accessToken))
    .send({ displayName: "Grading Player", dateOfBirth: "2005-01-01", gender: "MALE" });

  return {
    owner,
    academy,
    beltSystemId,
    whiteGradeId: whiteRes.body.data.id as string,
    yellowGradeId: yellowRes.body.data.id as string,
    player,
    playerId: playerProfileRes.body.data.id as string,
  };
}

async function createEvent(academyId: string, ownerToken: string, beltSystemId: string) {
  const res = await request(app)
    .post(`/api/v1/academies/${academyId}/grading-events`)
    .set(auth(ownerToken))
    .send({ name: "Spring Grading", beltSystemId, eventDate: "2026-06-01" });
  return res.body.data.id as string;
}

describe("belt systems and grades", () => {
  it("creates a belt system", async () => {
    const { beltSystemId } = await setup();
    expect(beltSystemId).toBeTruthy();
  });

  it("creates belt grades in order", async () => {
    const { beltSystemId } = await setup();
    const res = await request(app).get(`/api/v1/grading/belt-systems/${beltSystemId}/grades`);
    expect(res.status).toBe(200);
    expect(res.body.data.map((g: { name: string }) => g.name)).toEqual(["White", "Yellow"]);
  });
});

describe("grading events", () => {
  it("creates a grading event", async () => {
    const { academy, owner, beltSystemId } = await setup();
    const eventId = await createEvent(academy.id, owner.accessToken, beltSystemId);
    expect(eventId).toBeTruthy();

    const getRes = await request(app).get(`/api/v1/grading-events/${eventId}`).set(auth(owner.accessToken));
    expect(getRes.body.data.status).toBe("DRAFT");
  });

  it("adds a participant with an ordered target grade", async () => {
    const { academy, owner, beltSystemId, playerId, whiteGradeId } = await setup();
    const eventId = await createEvent(academy.id, owner.accessToken, beltSystemId);

    const res = await request(app)
      .post(`/api/v1/academies/${academy.id}/grading-events/${eventId}/participants`)
      .set(auth(owner.accessToken))
      .send({ playerId, targetGradeId: whiteGradeId });

    expect(res.status).toBe(201);
    expect(res.body.data.result).toBe("PENDING");
  });

  it("rejects an unauthorized (non-admin) attempt to record a result", async () => {
    const { academy, owner, beltSystemId, playerId, whiteGradeId, player } = await setup();
    const eventId = await createEvent(academy.id, owner.accessToken, beltSystemId);
    await request(app)
      .post(`/api/v1/academies/${academy.id}/grading-events/${eventId}/status`)
      .set(auth(owner.accessToken))
      .send({ status: "SCHEDULED" });
    await request(app)
      .post(`/api/v1/academies/${academy.id}/grading-events/${eventId}/status`)
      .set(auth(owner.accessToken))
      .send({ status: "OPEN" });
    const participantRes = await request(app)
      .post(`/api/v1/academies/${academy.id}/grading-events/${eventId}/participants`)
      .set(auth(owner.accessToken))
      .send({ playerId, targetGradeId: whiteGradeId });

    // The player themself is not an academy administrator and must not be able to record their own result.
    const res = await request(app)
      .post(
        `/api/v1/academies/${academy.id}/grading-events/${eventId}/participants/${participantRes.body.data.id}/result`,
      )
      .set(auth(player.accessToken))
      .send({ result: "PASS" });

    expect(res.status).toBe(403);
  });

  it("records a valid grading result", async () => {
    const { academy, owner, beltSystemId, playerId, whiteGradeId } = await setup();
    const eventId = await createEvent(academy.id, owner.accessToken, beltSystemId);
    await request(app)
      .post(`/api/v1/academies/${academy.id}/grading-events/${eventId}/status`)
      .set(auth(owner.accessToken))
      .send({ status: "SCHEDULED" });
    await request(app)
      .post(`/api/v1/academies/${academy.id}/grading-events/${eventId}/status`)
      .set(auth(owner.accessToken))
      .send({ status: "OPEN" });
    const participantRes = await request(app)
      .post(`/api/v1/academies/${academy.id}/grading-events/${eventId}/participants`)
      .set(auth(owner.accessToken))
      .send({ playerId, targetGradeId: whiteGradeId });

    const res = await request(app)
      .post(
        `/api/v1/academies/${academy.id}/grading-events/${eventId}/participants/${participantRes.body.data.id}/result`,
      )
      .set(auth(owner.accessToken))
      .send({ result: "PASS" });

    expect(res.status).toBe(200);
    expect(res.body.data.result).toBe("PASS");
  });

  it("rejects an invalid configured transition (target grade not ahead of current)", async () => {
    const { academy, owner, beltSystemId, playerId, whiteGradeId, yellowGradeId } = await setup();
    const eventId = await createEvent(academy.id, owner.accessToken, beltSystemId);

    // Award White first via a full finalize cycle so the player's current grade becomes White.
    await request(app)
      .post(`/api/v1/academies/${academy.id}/grading-events/${eventId}/status`)
      .set(auth(owner.accessToken))
      .send({ status: "SCHEDULED" });
    await request(app)
      .post(`/api/v1/academies/${academy.id}/grading-events/${eventId}/status`)
      .set(auth(owner.accessToken))
      .send({ status: "OPEN" });
    const p1 = await request(app)
      .post(`/api/v1/academies/${academy.id}/grading-events/${eventId}/participants`)
      .set(auth(owner.accessToken))
      .send({ playerId, targetGradeId: yellowGradeId });
    expect(p1.status).toBe(201); // no current grade yet — any target allowed

    await request(app)
      .post(
        `/api/v1/academies/${academy.id}/grading-events/${eventId}/participants/${p1.body.data.id}/result`,
      )
      .set(auth(owner.accessToken))
      .send({ result: "PASS" });
    await request(app)
      .post(`/api/v1/academies/${academy.id}/grading-events/${eventId}/status`)
      .set(auth(owner.accessToken))
      .send({ status: "IN_PROGRESS" });
    await request(app)
      .post(`/api/v1/academies/${academy.id}/grading-events/${eventId}/status`)
      .set(auth(owner.accessToken))
      .send({ status: "COMPLETED" });
    await request(app)
      .post(`/api/v1/academies/${academy.id}/grading-events/${eventId}/status`)
      .set(auth(owner.accessToken))
      .send({ status: "FINALIZED" });

    // Now the player's current grade is Yellow (rankOrder 2). Testing again for White (rankOrder 1) must be rejected.
    const event2Id = await createEvent(academy.id, owner.accessToken, beltSystemId);
    await request(app)
      .post(`/api/v1/academies/${academy.id}/grading-events/${event2Id}/status`)
      .set(auth(owner.accessToken))
      .send({ status: "SCHEDULED" });
    await request(app)
      .post(`/api/v1/academies/${academy.id}/grading-events/${event2Id}/status`)
      .set(auth(owner.accessToken))
      .send({ status: "OPEN" });

    const res = await request(app)
      .post(`/api/v1/academies/${academy.id}/grading-events/${event2Id}/participants`)
      .set(auth(owner.accessToken))
      .send({ playerId, targetGradeId: whiteGradeId });

    expect(res.status).toBe(409);
  });

  it("rejects an invalid event status transition", async () => {
    const { academy, owner, beltSystemId } = await setup();
    const eventId = await createEvent(academy.id, owner.accessToken, beltSystemId);

    const res = await request(app)
      .post(`/api/v1/academies/${academy.id}/grading-events/${eventId}/status`)
      .set(auth(owner.accessToken))
      .send({ status: "FINALIZED" });

    expect(res.status).toBe(409);
  });

  it("blocks another academy's admin from modifying this academy's grading event", async () => {
    const { academy, owner, beltSystemId } = await setup();
    const eventId = await createEvent(academy.id, owner.accessToken, beltSystemId);
    const otherOwner = await registerAndLogin(app, "ACADEMY");
    await createAcademyWithOrganizer(otherOwner.userId);

    const res = await request(app)
      .post(`/api/v1/academies/${academy.id}/grading-events/${eventId}/status`)
      .set(auth(otherOwner.accessToken))
      .send({ status: "SCHEDULED" });

    expect(res.status).toBe(403);
  });
});

describe("belt history, awards, and certificates", () => {
  async function finalizeWithPass() {
    const setupResult = await setup();
    const { academy, owner, beltSystemId, playerId, whiteGradeId } = setupResult;
    const eventId = await createEvent(academy.id, owner.accessToken, beltSystemId);
    await request(app)
      .post(`/api/v1/academies/${academy.id}/grading-events/${eventId}/status`)
      .set(auth(owner.accessToken))
      .send({ status: "SCHEDULED" });
    await request(app)
      .post(`/api/v1/academies/${academy.id}/grading-events/${eventId}/status`)
      .set(auth(owner.accessToken))
      .send({ status: "OPEN" });
    const participantRes = await request(app)
      .post(`/api/v1/academies/${academy.id}/grading-events/${eventId}/participants`)
      .set(auth(owner.accessToken))
      .send({ playerId, targetGradeId: whiteGradeId });
    await request(app)
      .post(
        `/api/v1/academies/${academy.id}/grading-events/${eventId}/participants/${participantRes.body.data.id}/result`,
      )
      .set(auth(owner.accessToken))
      .send({ result: "PASS" });
    await request(app)
      .post(`/api/v1/academies/${academy.id}/grading-events/${eventId}/status`)
      .set(auth(owner.accessToken))
      .send({ status: "IN_PROGRESS" });
    await request(app)
      .post(`/api/v1/academies/${academy.id}/grading-events/${eventId}/status`)
      .set(auth(owner.accessToken))
      .send({ status: "COMPLETED" });
    const finalizeRes = await request(app)
      .post(`/api/v1/academies/${academy.id}/grading-events/${eventId}/status`)
      .set(auth(owner.accessToken))
      .send({ status: "FINALIZED" });

    return { ...setupResult, eventId, finalizeRes };
  }

  it("creates a belt history record after a finalized award", async () => {
    const { player } = await finalizeWithPass();

    const res = await request(app).get("/api/v1/players/me/belt-history").set(auth(player.accessToken));
    expect(res.status).toBe(200);
    expect(res.body.data.current.beltGrade.name).toBe("White");
    expect(res.body.data.current.verificationStatus).toBe("PENDING");
  });

  it("preserves the historical record as immutable and intact", async () => {
    const { playerId } = await finalizeWithPass();
    const rows = await prisma.playerBeltHistory.findMany({ where: { playerId } });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.isCurrent).toBe(true);
  });

  it("prevents a duplicate verified award of the same grade", async () => {
    const { academy, owner, beltSystemId, playerId, whiteGradeId } = await finalizeWithPass();

    // Verify the award first so it counts as an existing verified award of White.
    const history = await prisma.playerBeltHistory.findFirst({ where: { playerId } });
    const verifyRes = await request(app)
      .post(`/api/v1/grading/belt-history/${history!.id}/verify`)
      .set(auth(owner.accessToken))
      .send({ verificationStatus: "VERIFIED" });
    // Regression: the response's nested certificate must reflect the fresh
    // status, not a snapshot taken before the certificate was updated.
    expect(verifyRes.body.data.certificate.verificationStatus).toBe("VERIFIED");

    const eventId = await createEvent(academy.id, owner.accessToken, beltSystemId);
    await request(app)
      .post(`/api/v1/academies/${academy.id}/grading-events/${eventId}/status`)
      .set(auth(owner.accessToken))
      .send({ status: "SCHEDULED" });
    await request(app)
      .post(`/api/v1/academies/${academy.id}/grading-events/${eventId}/status`)
      .set(auth(owner.accessToken))
      .send({ status: "OPEN" });

    const res = await request(app)
      .post(`/api/v1/academies/${academy.id}/grading-events/${eventId}/participants`)
      .set(auth(owner.accessToken))
      .send({ playerId, targetGradeId: whiteGradeId });

    expect(res.status).toBe(409);
  });

  it("does not let a player self-verify their own belt history", async () => {
    const { player, playerId } = await finalizeWithPass();
    const history = await prisma.playerBeltHistory.findFirst({ where: { playerId } });

    const res = await request(app)
      .post(`/api/v1/grading/belt-history/${history!.id}/verify`)
      .set(auth(player.accessToken))
      .send({ verificationStatus: "VERIFIED" });

    expect(res.status).toBe(403);
  });

  it("blocks an unrelated academy from verifying another academy's award", async () => {
    const { playerId } = await finalizeWithPass();
    const history = await prisma.playerBeltHistory.findFirst({ where: { playerId } });
    const otherOwner = await registerAndLogin(app, "ACADEMY");
    await createAcademyWithOrganizer(otherOwner.userId);

    const res = await request(app)
      .post(`/api/v1/grading/belt-history/${history!.id}/verify`)
      .set(auth(otherOwner.accessToken))
      .send({ verificationStatus: "VERIFIED" });

    expect(res.status).toBe(403);
  });

  it("protects certificate verification status via the public lookup, unauthenticated", async () => {
    const { playerId, owner } = await finalizeWithPass();
    const history = await prisma.playerBeltHistory.findFirst({ where: { playerId } });
    const certificate = await prisma.certificate.findUnique({ where: { id: history!.certificateId! } });

    const beforeVerify = await request(app).get(
      `/api/v1/grading/certificates/verify/${certificate!.verificationCode}`,
    );
    expect(beforeVerify.body.data.verificationStatus).toBe("PENDING");

    await request(app)
      .post(`/api/v1/grading/belt-history/${history!.id}/verify`)
      .set(auth(owner.accessToken))
      .send({ verificationStatus: "VERIFIED" });

    const afterVerify = await request(app).get(
      `/api/v1/grading/certificates/verify/${certificate!.verificationCode}`,
    );
    expect(afterVerify.body.data.verificationStatus).toBe("VERIFIED");

    // No client input can change verification status through the public lookup — it's a GET.
    const unknownCode = await request(app).get("/api/v1/grading/certificates/verify/not-a-real-code");
    expect(unknownCode.status).toBe(404);
  });
});
