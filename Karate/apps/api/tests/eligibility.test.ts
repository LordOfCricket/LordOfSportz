import { describe, it, expect } from "vitest";
import request from "supertest";
import { prisma } from "@karate/database";
import {
  buildTestApp,
  registerAndLogin,
  createAcademyWithOrganizer,
  createOpenTournamentWithCategory,
  createVerifiedBeltForPlayer,
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

async function setupOpenTournament() {
  const owner = await registerAndLogin(app, "ACADEMY");
  const { academy, organizer } = await createAcademyWithOrganizer(owner.userId);
  const { tournament, category, competition } = await createOpenTournamentWithCategory(
    organizer.id,
    owner.userId,
  );
  return { owner, academy, organizer, tournament, category, competition };
}

describe("Eligibility engine integration (Phase 7)", () => {
  it("registration creation runs the engine automatically and stores a structured result", async () => {
    const { competition } = await setupOpenTournament();
    const player = await createPlayer();
    const res = await request(app)
      .post("/api/v1/registrations")
      .set(auth(player.accessToken))
      .send({ competitionId: competition.id });
    expect(res.status).toBe(201);
    expect(res.body.data.eligibility.status).toBe("ELIGIBLE");
    expect(res.body.data.eligibility.reasonCodes).toEqual([]);
  });

  it("10. an unrelated academy cannot override eligibility on another organizer's tournament", async () => {
    const { competition } = await setupOpenTournament();
    const player = await createPlayer();
    const createRes = await request(app)
      .post("/api/v1/registrations")
      .set(auth(player.accessToken))
      .send({ competitionId: competition.id });
    const registrationId = createRes.body.data.id as string;

    const otherOwner = await registerAndLogin(app, "ACADEMY");
    await createAcademyWithOrganizer(otherOwner.userId);

    const res = await request(app)
      .post(`/api/v1/registrations/${registrationId}/eligibility/override`)
      .set(auth(otherOwner.accessToken))
      .send({ status: "ELIGIBLE" });
    expect(res.status).toBe(403);
  });

  it("11. re-evaluation reflects a belt verified after the original registration", async () => {
    const { competition, category } = await setupOpenTournament();
    await prisma.category.update({ where: { id: category.id }, data: { beltGradeMinOrder: 1 } });
    const player = await createPlayer();

    const createRes = await request(app)
      .post("/api/v1/registrations")
      .set(auth(player.accessToken))
      .send({ competitionId: competition.id });
    expect(createRes.body.data.eligibility.status).toBe("INELIGIBLE");
    expect(createRes.body.data.eligibility.reasonCodes).toContain("BELT_NOT_VERIFIED");

    await createVerifiedBeltForPlayer(player.playerId);

    const registrationId = createRes.body.data.id as string;
    const res = await request(app)
      .post(`/api/v1/registrations/${registrationId}/eligibility/re-evaluate`)
      .set(auth(player.accessToken));
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("ELIGIBLE");
  });

  it("12. a player cannot spoof their own eligibility to ELIGIBLE via override", async () => {
    const { competition } = await setupOpenTournament();
    const player = await createPlayer();
    const createRes = await request(app)
      .post("/api/v1/registrations")
      .set(auth(player.accessToken))
      .send({ competitionId: competition.id });
    const registrationId = createRes.body.data.id as string;

    const res = await request(app)
      .post(`/api/v1/registrations/${registrationId}/eligibility/override`)
      .set(auth(player.accessToken))
      .send({ status: "ELIGIBLE" });
    expect(res.status).toBe(403);
  });

  it("13. the player's server-resolved verified belt drives the eligibility outcome, not a client claim", async () => {
    const { competition, category } = await setupOpenTournament();
    await prisma.category.update({ where: { id: category.id }, data: { beltGradeMinOrder: 5 } });
    const player = await createPlayer();
    await createVerifiedBeltForPlayer(player.playerId); // awards rankOrder 1, below the required 5

    const res = await request(app)
      .post("/api/v1/registrations")
      .set(auth(player.accessToken))
      .send({ competitionId: competition.id, verifiedGradeRankOrder: 99 });
    expect(res.status).toBe(201);
    expect(res.body.data.eligibility.status).toBe("INELIGIBLE");
    expect(res.body.data.eligibility.reasonCodes).toContain("BELT_NOT_ELIGIBLE");
  });

  it("14. a different academy's admin (not the tournament organizer) cannot override eligibility", async () => {
    const { competition } = await setupOpenTournament();
    const player = await createPlayer("Boundary Player");
    const createRes = await request(app)
      .post("/api/v1/registrations")
      .set(auth(player.accessToken))
      .send({ competitionId: competition.id });
    const registrationId = createRes.body.data.id as string;

    // A separate academy admin, standing in for "some other organization" — never authorized
    // over a tournament it does not organize, regardless of any relationship to the player.
    const unrelatedOwner = await registerAndLogin(app, "ACADEMY");
    await createAcademyWithOrganizer(unrelatedOwner.userId);

    const res = await request(app)
      .post(`/api/v1/registrations/${registrationId}/eligibility/override`)
      .set(auth(unrelatedOwner.accessToken))
      .send({ status: "ELIGIBLE" });
    expect(res.status).toBe(403);
  });
});
