import { describe, it, expect } from "vitest";
import request from "supertest";
import { randomUUID } from "node:crypto";
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

async function createCoach() {
  const coach = await registerAndLogin(app, "COACH");
  const res = await request(app)
    .post("/api/v1/coaches/profile")
    .set(auth(coach.accessToken))
    .send({ displayName: "Test Coach" });
  return { ...coach, coachId: res.body.data.id as string };
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

describe("Registrations (Phase 6)", () => {
  it("1. valid registration succeeds", async () => {
    const { competition } = await setupOpenTournament();
    const player = await createPlayer();
    const res = await request(app)
      .post("/api/v1/registrations")
      .set(auth(player.accessToken))
      .send({ competitionId: competition.id });
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe("SUBMITTED");
    expect(res.body.data.player.id).toBe(player.playerId);
  });

  it("2. unauthenticated registration is rejected", async () => {
    const { competition } = await setupOpenTournament();
    const res = await request(app).post("/api/v1/registrations").send({ competitionId: competition.id });
    expect(res.status).toBe(401);
  });

  it("3. a scorer cannot create a registration (not a player/coach/academy actor)", async () => {
    const { competition } = await setupOpenTournament();
    const scorer = await registerAndLogin(app, "SCORER");
    const res = await request(app)
      .post("/api/v1/registrations")
      .set(auth(scorer.accessToken))
      .send({ competitionId: competition.id });
    expect(res.status).toBe(403);
  });

  it("4. a player cannot register another player", async () => {
    const { competition } = await setupOpenTournament();
    const playerA = await createPlayer("Player A");
    const playerB = await createPlayer("Player B");
    const res = await request(app)
      .post("/api/v1/registrations")
      .set(auth(playerA.accessToken))
      .send({ competitionId: competition.id, playerId: playerB.playerId });
    expect(res.status).toBe(403);
  });

  it("5. registration into a non-open tournament is rejected", async () => {
    const owner = await registerAndLogin(app, "ACADEMY");
    const { organizer } = await createAcademyWithOrganizer(owner.userId);
    const tournament = await prisma.tournament.create({
      data: {
        organizerId: organizer.id,
        name: "Draft Tournament",
        slug: `draft-${randomUUID()}`,
        status: "DRAFT",
        createdByUserId: owner.userId,
      },
    });
    const category = await prisma.category.create({ data: { tournamentId: tournament.id, name: "Cat" } });
    const competition = await prisma.competition.create({
      data: { tournamentId: tournament.id, categoryId: category.id, discipline: "KUMITE", name: "Comp" },
    });
    const player = await createPlayer();
    const res = await request(app)
      .post("/api/v1/registrations")
      .set(auth(player.accessToken))
      .send({ competitionId: competition.id });
    expect(res.status).toBe(409);
  });

  it("6. registration outside the open window is rejected", async () => {
    const owner = await registerAndLogin(app, "ACADEMY");
    const { organizer } = await createAcademyWithOrganizer(owner.userId);
    const past = new Date(Date.now() - 86_400_000);
    const { competition } = await createOpenTournamentWithCategory(organizer.id, owner.userId, {
      registrationClosesAt: past,
    });
    const player = await createPlayer();
    const res = await request(app)
      .post("/api/v1/registrations")
      .set(auth(player.accessToken))
      .send({ competitionId: competition.id });
    expect(res.status).toBe(409);
  });

  it("7. a competition whose category belongs to a different tournament is rejected", async () => {
    const owner = await registerAndLogin(app, "ACADEMY");
    const { organizer } = await createAcademyWithOrganizer(owner.userId);
    const t1 = await createOpenTournamentWithCategory(organizer.id, owner.userId);
    const t2 = await createOpenTournamentWithCategory(organizer.id, owner.userId);
    const inconsistentCompetition = await prisma.competition.create({
      data: { tournamentId: t1.tournament.id, categoryId: t2.category.id, discipline: "KATA", name: "Bad" },
    });
    const player = await createPlayer();
    const res = await request(app)
      .post("/api/v1/registrations")
      .set(auth(player.accessToken))
      .send({ competitionId: inconsistentCompetition.id });
    expect(res.status).toBe(409);
  });

  it("8. duplicate registration for the same competition is rejected", async () => {
    const { competition } = await setupOpenTournament();
    const player = await createPlayer();
    await request(app)
      .post("/api/v1/registrations")
      .set(auth(player.accessToken))
      .send({ competitionId: competition.id });
    const res = await request(app)
      .post("/api/v1/registrations")
      .set(auth(player.accessToken))
      .send({ competitionId: competition.id });
    expect(res.status).toBe(409);
  });

  it("9. the owning player can read their own registration", async () => {
    const { competition } = await setupOpenTournament();
    const player = await createPlayer();
    const createRes = await request(app)
      .post("/api/v1/registrations")
      .set(auth(player.accessToken))
      .send({ competitionId: competition.id });
    const id = createRes.body.data.id as string;
    const res = await request(app).get(`/api/v1/registrations/${id}`).set(auth(player.accessToken));
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(id);
  });

  it("10. an unrelated player cannot read someone else's registration", async () => {
    const { competition } = await setupOpenTournament();
    const owner = await createPlayer("Owner Player");
    const other = await createPlayer("Other Player");
    const createRes = await request(app)
      .post("/api/v1/registrations")
      .set(auth(owner.accessToken))
      .send({ competitionId: competition.id });
    const id = createRes.body.data.id as string;
    const res = await request(app).get(`/api/v1/registrations/${id}`).set(auth(other.accessToken));
    expect(res.status).toBe(403);
  });

  it("11. the owning player can withdraw a submitted registration", async () => {
    const { competition } = await setupOpenTournament();
    const player = await createPlayer();
    const createRes = await request(app)
      .post("/api/v1/registrations")
      .set(auth(player.accessToken))
      .send({ competitionId: competition.id });
    const id = createRes.body.data.id as string;
    const res = await request(app).post(`/api/v1/registrations/${id}/withdraw`).set(auth(player.accessToken));
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("WITHDRAWN");
  });

  it("12. withdrawing an already-withdrawn registration is rejected", async () => {
    const { competition } = await setupOpenTournament();
    const player = await createPlayer();
    const createRes = await request(app)
      .post("/api/v1/registrations")
      .set(auth(player.accessToken))
      .send({ competitionId: competition.id });
    const id = createRes.body.data.id as string;
    await request(app).post(`/api/v1/registrations/${id}/withdraw`).set(auth(player.accessToken));
    const res = await request(app).post(`/api/v1/registrations/${id}/withdraw`).set(auth(player.accessToken));
    expect(res.status).toBe(409);
  });

  it("13. an admin of a different academy cannot list another academy's registrations", async () => {
    const { academy } = await setupOpenTournament();
    const otherOwner = await registerAndLogin(app, "ACADEMY");
    await createAcademyWithOrganizer(otherOwner.userId);
    const res = await request(app)
      .get(`/api/v1/academies/${academy.id}/registrations`)
      .set(auth(otherOwner.accessToken));
    expect(res.status).toBe(403);
  });

  it("14. an unaffiliated coach cannot register a player outside their scope", async () => {
    const { competition } = await setupOpenTournament();
    const player = await createPlayer();
    const coach = await createCoach();
    const res = await request(app)
      .post("/api/v1/registrations")
      .set(auth(coach.accessToken))
      .send({ competitionId: competition.id, playerId: player.playerId });
    expect(res.status).toBe(403);
  });

  it("15. the player's verified current grade is resolved server-side onto the registration", async () => {
    const { competition } = await setupOpenTournament();
    const player = await createPlayer();
    const grade = await createVerifiedBeltForPlayer(player.playerId);
    const res = await request(app)
      .post("/api/v1/registrations")
      .set(auth(player.accessToken))
      .send({ competitionId: competition.id });
    expect(res.status).toBe(201);
    expect(res.body.data.beltGradeAtRegistration.id).toBe(grade.id);
  });

  it("16. a client-supplied belt grade cannot override the server-resolved snapshot", async () => {
    const { competition } = await setupOpenTournament();
    const player = await createPlayer();
    const realGrade = await createVerifiedBeltForPlayer(player.playerId);
    const res = await request(app).post("/api/v1/registrations").set(auth(player.accessToken)).send({
      competitionId: competition.id,
      beltGradeIdAtRegistration: randomUUID(),
      beltGradeId: randomUUID(),
    });
    expect(res.status).toBe(201);
    expect(res.body.data.beltGradeAtRegistration.id).toBe(realGrade.id);
  });

  it("17. a withdrawn registration remains readable as history, not deleted", async () => {
    const { competition } = await setupOpenTournament();
    const player = await createPlayer();
    const createRes = await request(app)
      .post("/api/v1/registrations")
      .set(auth(player.accessToken))
      .send({ competitionId: competition.id });
    const id = createRes.body.data.id as string;
    await request(app).post(`/api/v1/registrations/${id}/withdraw`).set(auth(player.accessToken));
    const res = await request(app).get(`/api/v1/registrations/${id}`).set(auth(player.accessToken));
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("WITHDRAWN");
    const row = await prisma.registration.findUnique({ where: { id } });
    expect(row).not.toBeNull();
  });
});
