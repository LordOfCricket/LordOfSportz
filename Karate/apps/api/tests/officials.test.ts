import { describe, it, expect } from "vitest";
import request from "supertest";
import { prisma } from "@karate/database";
import {
  buildTestApp,
  registerAndLogin,
  createAcademyWithOrganizer,
  createOpenTournamentWithCategory,
} from "./helpers";

const app = buildTestApp();
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

async function setup() {
  const owner = await registerAndLogin(app, "ACADEMY");
  const { academy, organizer } = await createAcademyWithOrganizer(owner.userId);
  const { tournament, category, competition } = await createOpenTournamentWithCategory(
    organizer.id,
    owner.userId,
  );
  return { owner, academy, organizer, tournament, category, competition };
}

/** A verified scorer — verification itself has no API yet (Phase 4 built the profile, nothing awards VERIFIED), so it's set directly, matching how other not-yet-built prerequisites have been seeded in earlier phases' tests. */
async function createVerifiedScorer() {
  const scorer = await registerAndLogin(app, "SCORER");
  const res = await request(app)
    .post("/api/v1/scorers/profile")
    .set(auth(scorer.accessToken))
    .send({ displayName: "Test Scorer" });
  const scorerProfileId = res.body.data.id as string;
  await prisma.scorerProfile.update({
    where: { id: scorerProfileId },
    data: { verificationStatus: "VERIFIED" },
  });
  return { scorer, scorerProfileId };
}

describe("Official assignment (Phase 13)", () => {
  it("1. an authorized organizer can assign a verified scorer", async () => {
    const { owner, tournament } = await setup();
    const { scorerProfileId } = await createVerifiedScorer();
    const res = await request(app)
      .post(`/api/v1/tournaments/${tournament.id}/officials`)
      .set(auth(owner.accessToken))
      .send({ scorerProfileId, function: "REFEREE" });
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe("ASSIGNED");
  });

  it("2. an unrelated academy cannot assign officials for another organizer's tournament", async () => {
    const { tournament } = await setup();
    const { scorerProfileId } = await createVerifiedScorer();
    const otherOwner = await registerAndLogin(app, "ACADEMY");
    await createAcademyWithOrganizer(otherOwner.userId);

    const res = await request(app)
      .post(`/api/v1/tournaments/${tournament.id}/officials`)
      .set(auth(otherOwner.accessToken))
      .send({ scorerProfileId, function: "REFEREE" });
    expect(res.status).toBe(403);
  });

  it("3. a scorer cannot assign themselves", async () => {
    const { tournament } = await setup();
    const { scorer, scorerProfileId } = await createVerifiedScorer();
    const res = await request(app)
      .post(`/api/v1/tournaments/${tournament.id}/officials`)
      .set(auth(scorer.accessToken))
      .send({ scorerProfileId, function: "REFEREE" });
    expect(res.status).toBe(403);
  });

  it("4. the assigned function is stored correctly", async () => {
    const { owner, tournament } = await setup();
    const { scorerProfileId } = await createVerifiedScorer();
    const res = await request(app)
      .post(`/api/v1/tournaments/${tournament.id}/officials`)
      .set(auth(owner.accessToken))
      .send({ scorerProfileId, function: "TIMEKEEPER" });
    expect(res.body.data.function).toBe("TIMEKEEPER");
  });

  it("5. the same scorer cannot be double-booked with an overlapping window", async () => {
    const { owner, tournament } = await setup();
    const { scorerProfileId } = await createVerifiedScorer();
    const startAt = "2026-06-01T09:00:00.000Z";
    const endAt = "2026-06-01T11:00:00.000Z";
    await request(app)
      .post(`/api/v1/tournaments/${tournament.id}/officials`)
      .set(auth(owner.accessToken))
      .send({ scorerProfileId, function: "REFEREE", startAt, endAt });

    const res = await request(app)
      .post(`/api/v1/tournaments/${tournament.id}/officials`)
      .set(auth(owner.accessToken))
      .send({
        scorerProfileId,
        function: "JUDGE",
        startAt: "2026-06-01T10:00:00.000Z",
        endAt: "2026-06-01T12:00:00.000Z",
      });
    expect(res.status).toBe(409);
  });

  it("6. the same scorer cannot be assigned to two tatamis at overlapping times", async () => {
    const { owner, tournament } = await setup();
    const { scorerProfileId } = await createVerifiedScorer();
    const tatami1 = await request(app)
      .post(`/api/v1/tournaments/${tournament.id}/tatamis`)
      .set(auth(owner.accessToken))
      .send({ label: "Tatami 1" });
    const tatami2 = await request(app)
      .post(`/api/v1/tournaments/${tournament.id}/tatamis`)
      .set(auth(owner.accessToken))
      .send({ label: "Tatami 2" });

    const window = { startAt: "2026-06-01T09:00:00.000Z", endAt: "2026-06-01T10:00:00.000Z" };
    await request(app)
      .post(`/api/v1/tournaments/${tournament.id}/officials`)
      .set(auth(owner.accessToken))
      .send({ scorerProfileId, function: "REFEREE", tatamiId: tatami1.body.data.id, ...window });

    const res = await request(app)
      .post(`/api/v1/tournaments/${tournament.id}/officials`)
      .set(auth(owner.accessToken))
      .send({ scorerProfileId, function: "REFEREE", tatamiId: tatami2.body.data.id, ...window });
    expect(res.status).toBe(409);
  });

  it("7. assignment to a closed tatami is blocked", async () => {
    const { owner, tournament } = await setup();
    const { scorerProfileId } = await createVerifiedScorer();
    const tatami = await request(app)
      .post(`/api/v1/tournaments/${tournament.id}/tatamis`)
      .set(auth(owner.accessToken))
      .send({ label: "Tatami 1" });
    await request(app)
      .post(`/api/v1/tatamis/${tatami.body.data.id}/status`)
      .set(auth(owner.accessToken))
      .send({ status: "CLOSED" });

    const res = await request(app)
      .post(`/api/v1/tournaments/${tournament.id}/officials`)
      .set(auth(owner.accessToken))
      .send({ scorerProfileId, function: "REFEREE", tatamiId: tatami.body.data.id });
    expect(res.status).toBe(409);
  });

  it("8. assignment history is preserved (never overwritten)", async () => {
    const { owner, tournament } = await setup();
    const { scorerProfileId } = await createVerifiedScorer();
    const created = await request(app)
      .post(`/api/v1/tournaments/${tournament.id}/officials`)
      .set(auth(owner.accessToken))
      .send({ scorerProfileId, function: "REFEREE" });
    await request(app)
      .post(`/api/v1/official-assignments/${created.body.data.id}/status`)
      .set(auth(owner.accessToken))
      .send({ status: "CONFIRMED" });

    const list = await request(app)
      .get(`/api/v1/tournaments/${tournament.id}/officials`)
      .set(auth(owner.accessToken));
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0].status).toBe("CONFIRMED");
  });

  it("9. a revoked assignment is preserved historically, not deleted", async () => {
    const { owner, tournament } = await setup();
    const { scorerProfileId } = await createVerifiedScorer();
    const created = await request(app)
      .post(`/api/v1/tournaments/${tournament.id}/officials`)
      .set(auth(owner.accessToken))
      .send({ scorerProfileId, function: "REFEREE" });
    const revoked = await request(app)
      .post(`/api/v1/official-assignments/${created.body.data.id}/status`)
      .set(auth(owner.accessToken))
      .send({ status: "REVOKED" });
    expect(revoked.status).toBe(200);

    const row = await prisma.officialAssignment.findUnique({ where: { id: created.body.data.id } });
    expect(row).not.toBeNull();
    expect(row?.status).toBe("REVOKED");
  });

  it("10. a scorer can read their own assignment", async () => {
    const { owner, tournament } = await setup();
    const { scorer, scorerProfileId } = await createVerifiedScorer();
    const created = await request(app)
      .post(`/api/v1/tournaments/${tournament.id}/officials`)
      .set(auth(owner.accessToken))
      .send({ scorerProfileId, function: "REFEREE" });

    const res = await request(app)
      .get(`/api/v1/official-assignments/${created.body.data.id}`)
      .set(auth(scorer.accessToken));
    expect(res.status).toBe(200);
  });

  it("11. a different scorer cannot read someone else's assignment", async () => {
    const { owner, tournament } = await setup();
    const { scorerProfileId } = await createVerifiedScorer();
    const { scorer: otherScorer } = await createVerifiedScorer();
    const created = await request(app)
      .post(`/api/v1/tournaments/${tournament.id}/officials`)
      .set(auth(owner.accessToken))
      .send({ scorerProfileId, function: "REFEREE" });

    const res = await request(app)
      .get(`/api/v1/official-assignments/${created.body.data.id}`)
      .set(auth(otherScorer.accessToken));
    expect(res.status).toBe(403);
  });
});
