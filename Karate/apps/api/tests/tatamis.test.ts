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

async function makeReadyRegistration(owner: { accessToken: string }, competitionId: string) {
  const player = await registerAndLogin(app, "PLAYER");
  const profileRes = await request(app)
    .post("/api/v1/players/profile")
    .set(auth(player.accessToken))
    .send({ displayName: `Ready ${randomUUID().slice(0, 8)}`, dateOfBirth: "2005-01-01", gender: "MALE" });
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

/** Full pipeline: locked draw + 1 active tatami + published schedule, ready to start a bout. */
async function buildScheduledBout(
  owner: { accessToken: string },
  competitionId: string,
  tournamentId: string,
) {
  await makeReadyRegistration(owner, competitionId);
  await makeReadyRegistration(owner, competitionId);
  await prisma.tournament.update({ where: { id: tournamentId }, data: { status: "WEIGH_IN" } });
  const drawRes = await request(app)
    .post(`/api/v1/competitions/${competitionId}/draw`)
    .set(auth(owner.accessToken))
    .send({ bracketType: "SINGLE_ELIMINATION", seedingStrategy: "NONE" });
  const drawId = drawRes.body.data.id as string;
  await request(app).post(`/api/v1/draws/${drawId}/publish`).set(auth(owner.accessToken));
  await request(app).post(`/api/v1/draws/${drawId}/lock`).set(auth(owner.accessToken));

  const tatamiRes = await request(app)
    .post(`/api/v1/tournaments/${tournamentId}/tatamis`)
    .set(auth(owner.accessToken))
    .send({ label: "Tatami 1" });
  const tatamiId = tatamiRes.body.data.id as string;
  await request(app)
    .post(`/api/v1/tatamis/${tatamiId}/status`)
    .set(auth(owner.accessToken))
    .send({ status: "ACTIVE" });

  const scheduleRes = await request(app)
    .post(`/api/v1/tournaments/${tournamentId}/schedule`)
    .set(auth(owner.accessToken))
    .send({ startAt: "2026-06-01T09:00:00.000Z" });
  await request(app)
    .post(`/api/v1/schedules/${scheduleRes.body.data.id}/publish`)
    .set(auth(owner.accessToken));

  const boutId = scheduleRes.body.data.entries[0].boutId as string;
  return { tatamiId, boutId };
}

describe("Tatami management (Phase 12)", () => {
  it("1. an organizer can create a tatami", async () => {
    const { owner, tournament } = await setup();
    const res = await request(app)
      .post(`/api/v1/tournaments/${tournament.id}/tatamis`)
      .set(auth(owner.accessToken))
      .send({ label: "Tatami 1" });
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe("INACTIVE");
  });

  it("2. a duplicate tatami label within the same tournament is rejected", async () => {
    const { owner, tournament } = await setup();
    await request(app)
      .post(`/api/v1/tournaments/${tournament.id}/tatamis`)
      .set(auth(owner.accessToken))
      .send({ label: "Tatami 1" });
    const res = await request(app)
      .post(`/api/v1/tournaments/${tournament.id}/tatamis`)
      .set(auth(owner.accessToken))
      .send({ label: "Tatami 1" });
    expect(res.status).toBe(409);
  });

  it("3. an invalid tatami status transition is rejected", async () => {
    const { owner, tournament } = await setup();
    const created = await request(app)
      .post(`/api/v1/tournaments/${tournament.id}/tatamis`)
      .set(auth(owner.accessToken))
      .send({ label: "Tatami 1" });
    const res = await request(app)
      .post(`/api/v1/tatamis/${created.body.data.id}/status`)
      .set(auth(owner.accessToken))
      .send({ status: "MAINTENANCE" }); // INACTIVE -> MAINTENANCE is not allowed
    expect(res.status).toBe(409);
  });

  it("4. starting a bout on an unavailable (non-ACTIVE) tatami is blocked", async () => {
    const { owner, competition, tournament } = await setup();
    const { tatamiId, boutId } = await buildScheduledBout(owner, competition.id, tournament.id);
    await request(app)
      .post(`/api/v1/tatamis/${tatamiId}/status`)
      .set(auth(owner.accessToken))
      .send({ status: "PAUSED" });

    const res = await request(app).post(`/api/v1/bouts/${boutId}/start`).set(auth(owner.accessToken));
    expect(res.status).toBe(409);
  });

  it("5 & 6. a tatami cannot run two bouts in progress simultaneously", async () => {
    const { owner, competition, tournament } = await setup();
    await makeReadyRegistration(owner, competition.id);
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

    const tatamiRes = await request(app)
      .post(`/api/v1/tournaments/${tournament.id}/tatamis`)
      .set(auth(owner.accessToken))
      .send({ label: "Tatami 1" });
    const tatamiId = tatamiRes.body.data.id as string;
    await request(app)
      .post(`/api/v1/tatamis/${tatamiId}/status`)
      .set(auth(owner.accessToken))
      .send({ status: "ACTIVE" });

    // Force both round-1 bouts onto the SAME tatami to create a real conflict scenario.
    const scheduleRes = await request(app)
      .post(`/api/v1/tournaments/${tournament.id}/schedule`)
      .set(auth(owner.accessToken))
      .send({ startAt: "2026-06-01T09:00:00.000Z" });
    await request(app)
      .post(`/api/v1/schedules/${scheduleRes.body.data.id}/publish`)
      .set(auth(owner.accessToken));
    const round1Bouts = scheduleRes.body.data.entries.filter(
      (e: { roundNumber: number }) => e.roundNumber === 1,
    );
    expect(round1Bouts.length).toBeGreaterThanOrEqual(2);

    const first = await request(app)
      .post(`/api/v1/bouts/${round1Bouts[0].boutId}/start`)
      .set(auth(owner.accessToken));
    expect(first.status).toBe(200);

    // Manually reassign the second bout's schedule entry to the SAME tatami to simulate the conflict.
    await prisma.boutSchedule.updateMany({
      where: { boutId: round1Bouts[1].boutId, schedule: { isActive: true } },
      data: { tatamiId },
    });
    const second = await request(app)
      .post(`/api/v1/bouts/${round1Bouts[1].boutId}/start`)
      .set(auth(owner.accessToken));
    expect(second.status).toBe(409);
  });

  it("7. an organizer can transition a tatami through its lifecycle", async () => {
    const { owner, tournament } = await setup();
    const created = await request(app)
      .post(`/api/v1/tournaments/${tournament.id}/tatamis`)
      .set(auth(owner.accessToken))
      .send({ label: "Tatami 1" });
    const res = await request(app)
      .post(`/api/v1/tatamis/${created.body.data.id}/status`)
      .set(auth(owner.accessToken))
      .send({ status: "ACTIVE" });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("ACTIVE");
  });

  it("8. an unrelated academy cannot manage another organizer's tatami", async () => {
    const { tournament } = await setup();
    const otherOwner = await registerAndLogin(app, "ACADEMY");
    await createAcademyWithOrganizer(otherOwner.userId);

    const res = await request(app)
      .post(`/api/v1/tournaments/${tournament.id}/tatamis`)
      .set(auth(otherOwner.accessToken))
      .send({ label: "Tatami 1" });
    expect(res.status).toBe(403);
  });
});
