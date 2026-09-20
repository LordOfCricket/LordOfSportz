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

async function setup() {
  const owner = await registerAndLogin(app, "ACADEMY");
  const { academy, organizer } = await createAcademyWithOrganizer(owner.userId);
  const { tournament, category, competition } = await createOpenTournamentWithCategory(
    organizer.id,
    owner.userId,
  );
  return { owner, academy, organizer, tournament, category, competition };
}

async function moveTournamentToWeighIn(tournamentId: string) {
  await prisma.tournament.update({ where: { id: tournamentId }, data: { status: "WEIGH_IN" } });
}

/** Registers a fresh player and gets them all the way to READY (no weight bound in these tests' category, so only medical clearance is needed). */
async function makeReadyRegistration(
  owner: { accessToken: string },
  competitionId: string,
  displayName?: string,
) {
  const player = await registerAndLogin(app, "PLAYER");
  const profileRes = await request(app)
    .post("/api/v1/players/profile")
    .set(auth(player.accessToken))
    .send({
      displayName: displayName ?? `Ready ${randomUUID().slice(0, 8)}`,
      dateOfBirth: "2005-01-01",
      gender: "MALE",
    });
  const playerId = profileRes.body.data.id as string;

  const regRes = await request(app)
    .post("/api/v1/registrations")
    .set(auth(player.accessToken))
    .send({ competitionId });
  const registrationId = regRes.body.data.id as string;

  await request(app)
    .post(`/api/v1/registrations/${registrationId}/medical/decision`)
    .set(auth(owner.accessToken))
    .send({ status: "CLEARED" });

  return { player, playerId, registrationId };
}

describe("Draw / bracket generation (Phase 10)", () => {
  it("1 & 2. only READY registrations enter the draw; a non-ready one is excluded", async () => {
    const { owner, competition, tournament } = await setup();
    const ready1 = await makeReadyRegistration(owner, competition.id);
    const ready2 = await makeReadyRegistration(owner, competition.id);
    // Not-ready: registered but never medically cleared.
    const notReadyPlayer = await registerAndLogin(app, "PLAYER");
    await request(app)
      .post("/api/v1/players/profile")
      .set(auth(notReadyPlayer.accessToken))
      .send({ displayName: "Not Ready", dateOfBirth: "2005-01-01", gender: "MALE" });
    await request(app)
      .post("/api/v1/registrations")
      .set(auth(notReadyPlayer.accessToken))
      .send({ competitionId: competition.id });

    await moveTournamentToWeighIn(tournament.id);
    const res = await request(app)
      .post(`/api/v1/competitions/${competition.id}/draw`)
      .set(auth(owner.accessToken))
      .send({ bracketType: "SINGLE_ELIMINATION", seedingStrategy: "NONE" });

    expect(res.status).toBe(201);
    const seedPlayerIds = res.body.data.seeds.map((s: { playerId: string }) => s.playerId);
    expect(seedPlayerIds).toContain(ready1.playerId);
    expect(seedPlayerIds).toContain(ready2.playerId);
    expect(seedPlayerIds).not.toContain(notReadyPlayer.userId);
    expect(res.body.data.seeds).toHaveLength(2);
  });

  it("3. a withdrawn registration is excluded from the draw", async () => {
    const { owner, competition, tournament } = await setup();
    const ready1 = await makeReadyRegistration(owner, competition.id);
    const ready2 = await makeReadyRegistration(owner, competition.id);
    const withdrawn = await makeReadyRegistration(owner, competition.id);
    await request(app)
      .post(`/api/v1/registrations/${withdrawn.registrationId}/withdraw`)
      .set(auth(withdrawn.player.accessToken));

    await moveTournamentToWeighIn(tournament.id);
    const res = await request(app)
      .post(`/api/v1/competitions/${competition.id}/draw`)
      .set(auth(owner.accessToken))
      .send({ bracketType: "SINGLE_ELIMINATION", seedingStrategy: "NONE" });

    const seedPlayerIds = res.body.data.seeds.map((s: { playerId: string }) => s.playerId);
    expect(seedPlayerIds.sort()).toEqual([ready1.playerId, ready2.playerId].sort());
    expect(seedPlayerIds).not.toContain(withdrawn.playerId);
  });

  it("4. no duplicate player appears among the generated seeds", async () => {
    const { owner, competition, tournament } = await setup();
    await makeReadyRegistration(owner, competition.id);
    await makeReadyRegistration(owner, competition.id);
    await makeReadyRegistration(owner, competition.id);
    await moveTournamentToWeighIn(tournament.id);

    const res = await request(app)
      .post(`/api/v1/competitions/${competition.id}/draw`)
      .set(auth(owner.accessToken))
      .send({ bracketType: "SINGLE_ELIMINATION", seedingStrategy: "NONE" });

    const playerIds = res.body.data.seeds.map((s: { playerId: string }) => s.playerId);
    expect(new Set(playerIds).size).toBe(playerIds.length);
  });

  it("5. a single-elimination draw is generated with rounds and bouts", async () => {
    const { owner, competition, tournament } = await setup();
    for (let i = 0; i < 4; i++) await makeReadyRegistration(owner, competition.id);
    await moveTournamentToWeighIn(tournament.id);

    const res = await request(app)
      .post(`/api/v1/competitions/${competition.id}/draw`)
      .set(auth(owner.accessToken))
      .send({ bracketType: "SINGLE_ELIMINATION", seedingStrategy: "NONE" });

    expect(res.status).toBe(201);
    expect(res.body.data.bracketType).toBe("SINGLE_ELIMINATION");
    expect(res.body.data.rounds).toHaveLength(2); // 4 players -> semifinal + final
    expect(res.body.data.rounds[0].bouts).toHaveLength(2);
  });

  it("6. a round-robin draw is generated with the correct number of rounds", async () => {
    const { owner, competition, tournament } = await setup();
    for (let i = 0; i < 4; i++) await makeReadyRegistration(owner, competition.id);
    await moveTournamentToWeighIn(tournament.id);

    const res = await request(app)
      .post(`/api/v1/competitions/${competition.id}/draw`)
      .set(auth(owner.accessToken))
      .send({ bracketType: "ROUND_ROBIN", seedingStrategy: "NONE" });

    expect(res.status).toBe(201);
    expect(res.body.data.rounds).toHaveLength(3); // n-1 rounds for 4 players
  });

  it("7. manual seeding places explicit seed numbers", async () => {
    const { owner, competition, tournament } = await setup();
    const a = await makeReadyRegistration(owner, competition.id);
    const b = await makeReadyRegistration(owner, competition.id);
    await moveTournamentToWeighIn(tournament.id);

    const res = await request(app)
      .post(`/api/v1/competitions/${competition.id}/draw`)
      .set(auth(owner.accessToken))
      .send({
        bracketType: "SINGLE_ELIMINATION",
        seedingStrategy: "MANUAL",
        manualSeeds: [
          { registrationId: b.registrationId, seedNumber: 1 },
          { registrationId: a.registrationId, seedNumber: 2 },
        ],
      });

    const seed1 = res.body.data.seeds.find((s: { seedNumber: number | null }) => s.seedNumber === 1);
    expect(seed1.playerId).toBe(b.playerId);
  });

  it("8. random draw generation works and leaves entrants unseeded", async () => {
    const { owner, competition, tournament } = await setup();
    for (let i = 0; i < 4; i++) await makeReadyRegistration(owner, competition.id);
    await moveTournamentToWeighIn(tournament.id);

    const res = await request(app)
      .post(`/api/v1/competitions/${competition.id}/draw`)
      .set(auth(owner.accessToken))
      .send({ bracketType: "SINGLE_ELIMINATION", seedingStrategy: "RANDOM" });

    expect(res.status).toBe(201);
    expect(res.body.data.seeds.every((s: { seedNumber: number | null }) => s.seedNumber === null)).toBe(true);
  });

  it("9. bye handling: a non-power-of-two field produces explicit byes, never a fake player", async () => {
    const { owner, competition, tournament } = await setup();
    for (let i = 0; i < 5; i++) await makeReadyRegistration(owner, competition.id);
    await moveTournamentToWeighIn(tournament.id);

    const res = await request(app)
      .post(`/api/v1/competitions/${competition.id}/draw`)
      .set(auth(owner.accessToken))
      .send({ bracketType: "SINGLE_ELIMINATION", seedingStrategy: "NONE" });

    expect(res.body.data.rounds[0].bouts).toHaveLength(4); // 8-slot bracket
    const byes = res.body.data.rounds[0].bouts.filter((b: { isBye: boolean }) => b.isBye);
    expect(byes).toHaveLength(3);
  });

  it("10. draw generation is blocked when the tournament status doesn't allow it", async () => {
    const { owner, competition } = await setup(); // still REGISTRATION_OPEN, not WEIGH_IN
    await makeReadyRegistration(owner, competition.id);
    await makeReadyRegistration(owner, competition.id);

    const res = await request(app)
      .post(`/api/v1/competitions/${competition.id}/draw`)
      .set(auth(owner.accessToken))
      .send({ bracketType: "SINGLE_ELIMINATION", seedingStrategy: "NONE" });
    expect(res.status).toBe(409);
  });

  it("11. an unrelated academy cannot generate a draw for another organizer's competition", async () => {
    const { competition, tournament } = await setup();
    await moveTournamentToWeighIn(tournament.id);
    const otherOwner = await registerAndLogin(app, "ACADEMY");
    await createAcademyWithOrganizer(otherOwner.userId);

    const res = await request(app)
      .post(`/api/v1/competitions/${competition.id}/draw`)
      .set(auth(otherOwner.accessToken))
      .send({ bracketType: "SINGLE_ELIMINATION", seedingStrategy: "NONE" });
    expect(res.status).toBe(403);
  });

  it("12. a LOCKED draw cannot be silently regenerated without an explicit force", async () => {
    const { owner, competition, tournament } = await setup();
    for (let i = 0; i < 2; i++) await makeReadyRegistration(owner, competition.id);
    await moveTournamentToWeighIn(tournament.id);

    const created = await request(app)
      .post(`/api/v1/competitions/${competition.id}/draw`)
      .set(auth(owner.accessToken))
      .send({ bracketType: "SINGLE_ELIMINATION", seedingStrategy: "NONE" });
    const drawId = created.body.data.id as string;
    await request(app).post(`/api/v1/draws/${drawId}/publish`).set(auth(owner.accessToken));
    await request(app).post(`/api/v1/draws/${drawId}/lock`).set(auth(owner.accessToken));

    const res = await request(app)
      .post(`/api/v1/competitions/${competition.id}/draw`)
      .set(auth(owner.accessToken))
      .send({ bracketType: "SINGLE_ELIMINATION", seedingStrategy: "NONE" });
    expect(res.status).toBe(409);
  });

  it("13. an authorized re-draw preserves the previous locked version", async () => {
    const { owner, competition, tournament } = await setup();
    for (let i = 0; i < 2; i++) await makeReadyRegistration(owner, competition.id);
    await moveTournamentToWeighIn(tournament.id);

    const created = await request(app)
      .post(`/api/v1/competitions/${competition.id}/draw`)
      .set(auth(owner.accessToken))
      .send({ bracketType: "SINGLE_ELIMINATION", seedingStrategy: "NONE" });
    const drawId = created.body.data.id as string;
    await request(app).post(`/api/v1/draws/${drawId}/publish`).set(auth(owner.accessToken));
    await request(app).post(`/api/v1/draws/${drawId}/lock`).set(auth(owner.accessToken));

    const redraw = await request(app)
      .post(`/api/v1/competitions/${competition.id}/draw`)
      .set(auth(owner.accessToken))
      .send({ bracketType: "SINGLE_ELIMINATION", seedingStrategy: "NONE", force: true });
    expect(redraw.status).toBe(201);
    expect(redraw.body.data.version).toBe(2);

    const previous = await prisma.draw.findUnique({ where: { id: drawId } });
    expect(previous?.status).toBe("SUPERSEDED");
    expect(previous?.isActive).toBe(false);
  });
});
