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

async function makeReadyRegistration(owner: { accessToken: string }, competitionId: string) {
  const player = await registerAndLogin(app, "PLAYER");
  const profileRes = await request(app)
    .post("/api/v1/players/profile")
    .set(auth(player.accessToken))
    .send({
      displayName: `Ready ${Math.random().toString(36).slice(2, 8)}`,
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

/** Full pipeline to a real, callable bout with two real (non-bye) participants. */
async function buildRealBout(owner: { accessToken: string }, competitionId: string, tournamentId: string) {
  const p1 = await makeReadyRegistration(owner, competitionId);
  const p2 = await makeReadyRegistration(owner, competitionId);
  await prisma.tournament.update({ where: { id: tournamentId }, data: { status: "WEIGH_IN" } });
  const drawRes = await request(app)
    .post(`/api/v1/competitions/${competitionId}/draw`)
    .set(auth(owner.accessToken))
    .send({ bracketType: "SINGLE_ELIMINATION", seedingStrategy: "NONE" });
  const drawId = drawRes.body.data.id as string;
  await request(app).post(`/api/v1/draws/${drawId}/publish`).set(auth(owner.accessToken));
  await request(app).post(`/api/v1/draws/${drawId}/lock`).set(auth(owner.accessToken));

  const draw = await prisma.draw.findUnique({
    where: { id: drawId },
    include: { rounds: { include: { bouts: true }, orderBy: { roundNumber: "asc" } } },
  });
  const boutId = draw!.rounds[0]!.bouts[0]!.id;
  return { boutId, p1, p2 };
}

describe("Bout engine (Phase 14)", () => {
  it("1. a valid bout with two real participants can be called and progressed", async () => {
    const { owner, competition, tournament } = await setup();
    const { boutId } = await buildRealBout(owner, competition.id, tournament.id);

    const called = await request(app).post(`/api/v1/bouts/${boutId}/call`).set(auth(owner.accessToken));
    expect(called.status).toBe(200);
    expect(called.body.data.status).toBe("CALLED");

    const ready = await request(app).post(`/api/v1/bouts/${boutId}/ready`).set(auth(owner.accessToken));
    expect(ready.body.data.status).toBe("READY");
  });

  it("2. calling a bye bout (invalid participants) is rejected", async () => {
    const { owner, competition, tournament } = await setup();
    // 3 entrants -> one bye in round 1.
    await makeReadyRegistration(owner, competition.id);
    await makeReadyRegistration(owner, competition.id);
    await makeReadyRegistration(owner, competition.id);
    await prisma.tournament.update({ where: { id: tournament.id }, data: { status: "WEIGH_IN" } });
    const drawRes = await request(app)
      .post(`/api/v1/competitions/${competition.id}/draw`)
      .set(auth(owner.accessToken))
      .send({ bracketType: "SINGLE_ELIMINATION", seedingStrategy: "NONE" });
    const drawId = drawRes.body.data.id as string;
    await request(app).post(`/api/v1/draws/${drawId}/publish`).set(auth(owner.accessToken));
    await request(app).post(`/api/v1/draws/${drawId}/lock`).set(auth(owner.accessToken));

    const draw = await prisma.draw.findUnique({
      where: { id: drawId },
      include: { rounds: { include: { bouts: true }, orderBy: { roundNumber: "asc" } } },
    });
    const byeBout = draw!.rounds[0]!.bouts.find((b) => b.redPlayerId === null || b.bluePlayerId === null)!;

    const res = await request(app).post(`/api/v1/bouts/${byeBout.id}/call`).set(auth(owner.accessToken));
    expect(res.status).toBe(409);
  });

  it("3. a bout cannot be called with the same player forced onto both sides", async () => {
    const { owner, competition, tournament } = await setup();
    const { boutId, p1 } = await buildRealBout(owner, competition.id, tournament.id);
    await prisma.bout.update({ where: { id: boutId }, data: { bluePlayerId: p1.playerId } });

    const res = await request(app).post(`/api/v1/bouts/${boutId}/call`).set(auth(owner.accessToken));
    expect(res.status).toBe(409);
  });

  it("4. a withdrawn participant blocks the bout from being called", async () => {
    const { owner, competition, tournament } = await setup();
    const { boutId, p1 } = await buildRealBout(owner, competition.id, tournament.id);
    await request(app)
      .post(`/api/v1/registrations/${p1.registrationId}/withdraw`)
      .set(auth(p1.player.accessToken));

    const res = await request(app).post(`/api/v1/bouts/${boutId}/call`).set(auth(owner.accessToken));
    expect(res.status).toBe(409);
  });

  it("5. invalid lifecycle transitions are rejected", async () => {
    const { owner, competition, tournament } = await setup();
    const { boutId } = await buildRealBout(owner, competition.id, tournament.id);
    // Cannot finalize a bout with no result yet.
    const res = await request(app).post(`/api/v1/bouts/${boutId}/finalize`).set(auth(owner.accessToken));
    expect(res.status).toBe(409);
  });

  it("6. pause and resume work through the full lifecycle", async () => {
    const { owner, competition, tournament } = await setup();
    const { boutId } = await buildRealBout(owner, competition.id, tournament.id);
    await request(app).post(`/api/v1/bouts/${boutId}/call`).set(auth(owner.accessToken));
    await request(app).post(`/api/v1/bouts/${boutId}/ready`).set(auth(owner.accessToken));
    const started = await request(app).post(`/api/v1/bouts/${boutId}/resume`).set(auth(owner.accessToken));
    expect(started.body.data.status).toBe("IN_PROGRESS");
    const paused = await request(app)
      .post(`/api/v1/bouts/${boutId}/pause`)
      .set(auth(owner.accessToken))
      .send({ reason: "injury check" });
    expect(paused.body.data.status).toBe("PAUSED");
    const resumed = await request(app).post(`/api/v1/bouts/${boutId}/resume`).set(auth(owner.accessToken));
    expect(resumed.body.data.status).toBe("IN_PROGRESS");
  });

  it("7. a walkover result finishes the bout without requiring live play", async () => {
    const { owner, competition, tournament } = await setup();
    const { boutId, p1 } = await buildRealBout(owner, competition.id, tournament.id);
    const res = await request(app)
      .post(`/api/v1/bouts/${boutId}/result`)
      .set(auth(owner.accessToken))
      .send({ method: "WALKOVER", winnerPlayerId: p1.playerId });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("FINISHED");
    expect(res.body.data.result.method).toBe("WALKOVER");
  });

  it("8. a no-show result is recorded correctly", async () => {
    const { owner, competition, tournament } = await setup();
    const { boutId, p2 } = await buildRealBout(owner, competition.id, tournament.id);
    const res = await request(app)
      .post(`/api/v1/bouts/${boutId}/result`)
      .set(auth(owner.accessToken))
      .send({ method: "NO_SHOW", winnerPlayerId: p2.playerId, reason: "Red did not appear" });
    expect(res.body.data.result.method).toBe("NO_SHOW");
  });

  it("9. an injury result is recorded correctly", async () => {
    const { owner, competition, tournament } = await setup();
    const { boutId, p2 } = await buildRealBout(owner, competition.id, tournament.id);
    const res = await request(app)
      .post(`/api/v1/bouts/${boutId}/result`)
      .set(auth(owner.accessToken))
      .send({ method: "INJURY", winnerPlayerId: p2.playerId, reason: "Ankle injury" });
    expect(res.body.data.result.method).toBe("INJURY");
  });

  it("10. a disqualification result is recorded correctly", async () => {
    const { owner, competition, tournament } = await setup();
    const { boutId, p1 } = await buildRealBout(owner, competition.id, tournament.id);
    const res = await request(app)
      .post(`/api/v1/bouts/${boutId}/result`)
      .set(auth(owner.accessToken))
      .send({ method: "DISQUALIFICATION", winnerPlayerId: p1.playerId, reason: "Excessive contact" });
    expect(res.body.data.result.method).toBe("DISQUALIFICATION");
  });

  it("11. a bout can be cancelled with a reason and the reason is preserved", async () => {
    const { owner, competition, tournament } = await setup();
    const { boutId } = await buildRealBout(owner, competition.id, tournament.id);
    const res = await request(app)
      .post(`/api/v1/bouts/${boutId}/cancel`)
      .set(auth(owner.accessToken))
      .send({ reason: "Tournament abandoned due to weather" });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("CANCELLED");
    expect(res.body.data.cancelReason).toBe("Tournament abandoned due to weather");
  });

  it("12. an unrelated academy cannot manage another organizer's bout", async () => {
    const { owner, competition, tournament } = await setup();
    const { boutId } = await buildRealBout(owner, competition.id, tournament.id);
    const otherOwner = await registerAndLogin(app, "ACADEMY");
    await createAcademyWithOrganizer(otherOwner.userId);

    const res = await request(app).post(`/api/v1/bouts/${boutId}/call`).set(auth(otherOwner.accessToken));
    expect(res.status).toBe(403);
  });

  it("13. a finalized bout's result and audit trail are preserved historically", async () => {
    const { owner, competition, tournament } = await setup();
    const { boutId, p1 } = await buildRealBout(owner, competition.id, tournament.id);
    await request(app)
      .post(`/api/v1/bouts/${boutId}/result`)
      .set(auth(owner.accessToken))
      .send({ method: "WALKOVER", winnerPlayerId: p1.playerId });
    const finalized = await request(app)
      .post(`/api/v1/bouts/${boutId}/finalize`)
      .set(auth(owner.accessToken));
    expect(finalized.status).toBe(200);
    expect(finalized.body.data.status).toBe("FINALIZED");
    expect(finalized.body.data.result.isFinal).toBe(true);

    const row = await prisma.boutResult.findUnique({ where: { boutId } });
    expect(row).not.toBeNull();
    expect(row?.method).toBe("WALKOVER");

    const auditRow = await prisma.auditLog.findFirst({
      where: { action: "BOUT_FINALIZED", entityId: boutId },
    });
    expect(auditRow).not.toBeNull();
  });

  it("14. a scheduled bout's tatami/time assignment is not disturbed by lifecycle actions", async () => {
    const { owner, competition, tournament } = await setup();
    const { boutId } = await buildRealBout(owner, competition.id, tournament.id);
    const tatami = await request(app)
      .post(`/api/v1/tournaments/${tournament.id}/tatamis`)
      .set(auth(owner.accessToken))
      .send({ label: "Tatami 1" });
    await request(app)
      .post(`/api/v1/tatamis/${tatami.body.data.id}/status`)
      .set(auth(owner.accessToken))
      .send({ status: "ACTIVE" });
    await request(app)
      .post(`/api/v1/tournaments/${tournament.id}/schedule`)
      .set(auth(owner.accessToken))
      .send({ startAt: "2026-06-01T09:00:00.000Z" });

    const before = await request(app).get(`/api/v1/bouts/${boutId}`).set(auth(owner.accessToken));
    await request(app).post(`/api/v1/bouts/${boutId}/call`).set(auth(owner.accessToken));
    const after = await request(app).get(`/api/v1/bouts/${boutId}`).set(auth(owner.accessToken));
    expect(after.body.data.scheduledAt).toBe(before.body.data.scheduledAt);
    expect(after.body.data.tatami?.id).toBe(before.body.data.tatami?.id);
  });
});
