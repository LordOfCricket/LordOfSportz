import { describe, it, expect } from "vitest";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { prisma } from "@karate/database";
import {
  buildTestApp,
  registerAndLogin,
  createAcademyWithOrganizer,
  createOpenTournamentWithCategory,
} from "./helpers";

const app = buildTestApp();
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

async function createPlayer(displayName = "Test Player") {
  const player = await registerAndLogin(app, "PLAYER");
  const res = await request(app)
    .post("/api/v1/players/profile")
    .set(auth(player.accessToken))
    .send({ displayName, dateOfBirth: "2005-01-01", gender: "MALE" });
  return { ...player, playerId: res.body.data.id as string };
}

/** A tournament with a category bounded to [60, 70] kg, so weigh-in actually applies. */
async function setupWeightBoundTournament() {
  const owner = await registerAndLogin(app, "ACADEMY");
  const { academy, organizer } = await createAcademyWithOrganizer(owner.userId);
  const { tournament, category, competition } = await createOpenTournamentWithCategory(
    organizer.id,
    owner.userId,
  );
  await prisma.category.update({ where: { id: category.id }, data: { weightMinKg: 60, weightMaxKg: 70 } });
  return { owner, academy, organizer, tournament, category, competition };
}

async function createRegistration(competitionId: string) {
  const player = await createPlayer();
  const res = await request(app)
    .post("/api/v1/registrations")
    .set(auth(player.accessToken))
    .send({ competitionId });
  return { player, registrationId: res.body.data.id as string };
}

describe("Weigh-in (Phase 9)", () => {
  it("1. a valid weigh-in attempt is recorded", async () => {
    const { owner, competition } = await setupWeightBoundTournament();
    const { registrationId } = await createRegistration(competition.id);
    const res = await request(app)
      .post(`/api/v1/registrations/${registrationId}/weigh-in`)
      .set(auth(owner.accessToken))
      .send({ measuredWeight: 65, unit: "KG" });
    expect(res.status).toBe(201);
    expect(res.body.data.attemptNumber).toBe(1);
  });

  it("2. an invalid measurement is rejected", async () => {
    const { owner, competition } = await setupWeightBoundTournament();
    const { registrationId } = await createRegistration(competition.id);
    const res = await request(app)
      .post(`/api/v1/registrations/${registrationId}/weigh-in`)
      .set(auth(owner.accessToken))
      .send({ measuredWeight: -5, unit: "KG" });
    expect(res.status).toBe(400);
  });

  it("3. a measurement within the category range passes", async () => {
    const { owner, competition } = await setupWeightBoundTournament();
    const { registrationId } = await createRegistration(competition.id);
    const res = await request(app)
      .post(`/api/v1/registrations/${registrationId}/weigh-in`)
      .set(auth(owner.accessToken))
      .send({ measuredWeight: 65, unit: "KG" });
    expect(res.body.data.status).toBe("PASSED");
  });

  it("4. a measurement outside the category range fails", async () => {
    const { owner, competition } = await setupWeightBoundTournament();
    const { registrationId } = await createRegistration(competition.id);
    const res = await request(app)
      .post(`/api/v1/registrations/${registrationId}/weigh-in`)
      .set(auth(owner.accessToken))
      .send({ measuredWeight: 80, unit: "KG" });
    expect(res.body.data.status).toBe("FAILED");
  });

  it("5. a re-weigh records a new attempt with a corrected measurement", async () => {
    const { owner, competition } = await setupWeightBoundTournament();
    const { registrationId } = await createRegistration(competition.id);
    await request(app)
      .post(`/api/v1/registrations/${registrationId}/weigh-in`)
      .set(auth(owner.accessToken))
      .send({ measuredWeight: 71.8, unit: "KG" });
    const second = await request(app)
      .post(`/api/v1/registrations/${registrationId}/weigh-in`)
      .set(auth(owner.accessToken))
      .send({ measuredWeight: 66.9, unit: "KG" });
    expect(second.body.data.attemptNumber).toBe(2);
    expect(second.body.data.status).toBe("PASSED");
  });

  it("6. the previous attempt is preserved unchanged after a re-weigh", async () => {
    const { owner, competition } = await setupWeightBoundTournament();
    const { registrationId } = await createRegistration(competition.id);
    await request(app)
      .post(`/api/v1/registrations/${registrationId}/weigh-in`)
      .set(auth(owner.accessToken))
      .send({ measuredWeight: 71.8, unit: "KG" });
    await request(app)
      .post(`/api/v1/registrations/${registrationId}/weigh-in`)
      .set(auth(owner.accessToken))
      .send({ measuredWeight: 66.9, unit: "KG" });

    const attempts = await prisma.weighInAttempt.findMany({
      where: { registrationId },
      orderBy: { attemptNumber: "asc" },
    });
    expect(attempts).toHaveLength(2);
    expect(attempts[0]!.status).toBe("FAILED");
    expect(Number(attempts[0]!.measuredWeightKg)).toBe(71.8);
  });

  it("7. recording a weigh-in for a non-existent registration is rejected", async () => {
    const { owner } = await setupWeightBoundTournament();
    const res = await request(app)
      .post(`/api/v1/registrations/${randomUUID()}/weigh-in`)
      .set(auth(owner.accessToken))
      .send({ measuredWeight: 65, unit: "KG" });
    expect(res.status).toBe(404);
  });

  it("8. an unrelated academy cannot record a weigh-in on another organizer's tournament", async () => {
    const { competition } = await setupWeightBoundTournament();
    const { registrationId } = await createRegistration(competition.id);
    const otherOwner = await registerAndLogin(app, "ACADEMY");
    await createAcademyWithOrganizer(otherOwner.userId);
    const res = await request(app)
      .post(`/api/v1/registrations/${registrationId}/weigh-in`)
      .set(auth(otherOwner.accessToken))
      .send({ measuredWeight: 65, unit: "KG" });
    expect(res.status).toBe(403);
  });

  it("9. a client-supplied verifier is ignored — the authenticated organizer is always recorded", async () => {
    const { owner, competition } = await setupWeightBoundTournament();
    const { registrationId } = await createRegistration(competition.id);
    await request(app)
      .post(`/api/v1/registrations/${registrationId}/weigh-in`)
      .set(auth(owner.accessToken))
      .send({ measuredWeight: 65, unit: "KG", verifiedByUserId: randomUUID() });

    const attempt = await prisma.weighInAttempt.findFirst({ where: { registrationId } });
    expect(attempt?.verifiedByUserId).toBe(owner.userId);
  });

  it("10 & 11. pass/fail is always computed server-side, never accepted from the client", async () => {
    const { owner, competition } = await setupWeightBoundTournament();
    const { registrationId } = await createRegistration(competition.id);
    const res = await request(app)
      .post(`/api/v1/registrations/${registrationId}/weigh-in`)
      .set(auth(owner.accessToken))
      .send({ measuredWeight: 90, unit: "KG", status: "PASSED" });
    expect(res.body.data.status).toBe("FAILED");
  });

  it("12. recording a weigh-in re-evaluates eligibility using the new official weight", async () => {
    const { owner, competition } = await setupWeightBoundTournament();
    const { player, registrationId } = await createRegistration(competition.id);

    const beforeRes = await request(app)
      .get(`/api/v1/registrations/${registrationId}`)
      .set(auth(player.accessToken));
    expect(beforeRes.body.data.eligibility.status).toBe("PENDING");
    expect(beforeRes.body.data.eligibility.reasonCodes).toContain("WEIGHT_NOT_YET_MEASURED");

    await request(app)
      .post(`/api/v1/registrations/${registrationId}/weigh-in`)
      .set(auth(owner.accessToken))
      .send({ measuredWeight: 65, unit: "KG" });

    const afterRes = await request(app)
      .get(`/api/v1/registrations/${registrationId}`)
      .set(auth(player.accessToken));
    expect(afterRes.body.data.eligibility.status).toBe("ELIGIBLE");
  });

  it("13. a failed weigh-in blocks overall competition readiness", async () => {
    const { owner, competition } = await setupWeightBoundTournament();
    const { player, registrationId } = await createRegistration(competition.id);
    await request(app)
      .post(`/api/v1/registrations/${registrationId}/weigh-in`)
      .set(auth(owner.accessToken))
      .send({ measuredWeight: 90, unit: "KG" });

    const res = await request(app)
      .get(`/api/v1/registrations/${registrationId}`)
      .set(auth(player.accessToken));
    expect(res.body.data.readiness.status).toBe("NOT_READY");
    expect(res.body.data.readiness.blockedBy).toContain("WEIGH_IN");
  });

  it("14. a passing weigh-in plus clearance satisfies readiness", async () => {
    const { owner, competition } = await setupWeightBoundTournament();
    const { player, registrationId } = await createRegistration(competition.id);
    await request(app)
      .post(`/api/v1/registrations/${registrationId}/medical/decision`)
      .set(auth(owner.accessToken))
      .send({ status: "CLEARED" });
    await request(app)
      .post(`/api/v1/registrations/${registrationId}/weigh-in`)
      .set(auth(owner.accessToken))
      .send({ measuredWeight: 65, unit: "KG" });

    const res = await request(app)
      .get(`/api/v1/registrations/${registrationId}`)
      .set(auth(player.accessToken));
    expect(res.body.data.readiness.status).toBe("READY");
    expect(res.body.data.readiness.blockedBy).toEqual([]);
  });

  it("15. all historical attempts remain intact and readable after multiple attempts and a reweigh flag", async () => {
    const { owner, competition } = await setupWeightBoundTournament();
    const { player, registrationId } = await createRegistration(competition.id);
    await request(app)
      .post(`/api/v1/registrations/${registrationId}/weigh-in`)
      .set(auth(owner.accessToken))
      .send({ measuredWeight: 71.8, unit: "KG" });
    await request(app)
      .post(`/api/v1/registrations/${registrationId}/weigh-in/reweigh`)
      .set(auth(owner.accessToken))
      .send({ reason: "Scale malfunction, redo required" });
    await request(app)
      .post(`/api/v1/registrations/${registrationId}/weigh-in`)
      .set(auth(owner.accessToken))
      .send({ measuredWeight: 66.9, unit: "KG" });

    const history = await request(app)
      .get(`/api/v1/registrations/${registrationId}/weigh-in`)
      .set(auth(player.accessToken));
    expect(history.body.data).toHaveLength(3);
    expect(history.body.data.map((a: { status: string }) => a.status)).toEqual([
      "FAILED",
      "REWEIGH_REQUIRED",
      "PASSED",
    ]);
  });
});
