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

async function createTatamis(tournamentId: string, count: number) {
  const tatamis = [];
  for (let i = 1; i <= count; i++) {
    tatamis.push(
      await prisma.tatami.create({ data: { tournamentId, label: `Tatami ${i}`, status: "ACTIVE" } }),
    );
  }
  return tatamis;
}

/** Full pipeline up to a LOCKED draw, ready for scheduling. */
async function buildLockedDraw(
  owner: { accessToken: string },
  competitionId: string,
  tournamentId: string,
  entrantCount = 4,
) {
  for (let i = 0; i < entrantCount; i++) await makeReadyRegistration(owner, competitionId);
  await prisma.tournament.update({ where: { id: tournamentId }, data: { status: "WEIGH_IN" } });
  const created = await request(app)
    .post(`/api/v1/competitions/${competitionId}/draw`)
    .set(auth(owner.accessToken))
    .send({ bracketType: "SINGLE_ELIMINATION", seedingStrategy: "NONE" });
  const drawId = created.body.data.id as string;
  await request(app).post(`/api/v1/draws/${drawId}/publish`).set(auth(owner.accessToken));
  await request(app).post(`/api/v1/draws/${drawId}/lock`).set(auth(owner.accessToken));
  return drawId;
}

describe("Scheduling (Phase 11)", () => {
  it("1. a schedule is generated from a locked draw", async () => {
    const { owner, competition, tournament } = await setup();
    await buildLockedDraw(owner, competition.id, tournament.id);
    await createTatamis(tournament.id, 2);

    const res = await request(app)
      .post(`/api/v1/tournaments/${tournament.id}/schedule`)
      .set(auth(owner.accessToken))
      .send({ startAt: "2026-06-01T09:00:00.000Z" });
    expect(res.status).toBe(201);
    expect(res.body.data.entries.length).toBeGreaterThan(0);
  });

  it("2. no bout appears twice in the generated schedule", async () => {
    const { owner, competition, tournament } = await setup();
    await buildLockedDraw(owner, competition.id, tournament.id);
    await createTatamis(tournament.id, 2);

    const res = await request(app)
      .post(`/api/v1/tournaments/${tournament.id}/schedule`)
      .set(auth(owner.accessToken))
      .send({ startAt: "2026-06-01T09:00:00.000Z" });
    const boutIds = res.body.data.entries.map((e: { boutId: string }) => e.boutId);
    expect(new Set(boutIds).size).toBe(boutIds.length);
  });

  it("3. no player is scheduled into two overlapping bouts", async () => {
    const { owner, competition, tournament } = await setup();
    await buildLockedDraw(owner, competition.id, tournament.id, 4);
    await createTatamis(tournament.id, 2);

    const res = await request(app)
      .post(`/api/v1/tournaments/${tournament.id}/schedule`)
      .set(auth(owner.accessToken))
      .send({ startAt: "2026-06-01T09:00:00.000Z" });

    const byPlayer = new Map<string, { start: number; end: number }[]>();
    for (const e of res.body.data.entries as {
      redPlayerId: string | null;
      bluePlayerId: string | null;
      scheduledAt: string;
      estimatedDurationMinutes: number;
    }[]) {
      const start = new Date(e.scheduledAt).getTime();
      const end = start + e.estimatedDurationMinutes * 60_000;
      for (const p of [e.redPlayerId, e.bluePlayerId]) {
        if (!p) continue;
        const windows = byPlayer.get(p) ?? [];
        for (const w of windows) {
          expect(start >= w.end || end <= w.start).toBe(true);
        }
        windows.push({ start, end });
        byPlayer.set(p, windows);
      }
    }
  });

  it("4. round 2 bouts are scheduled after round 1 finishes", async () => {
    const { owner, competition, tournament } = await setup();
    await buildLockedDraw(owner, competition.id, tournament.id, 4);
    await createTatamis(tournament.id, 2);

    const res = await request(app)
      .post(`/api/v1/tournaments/${tournament.id}/schedule`)
      .set(auth(owner.accessToken))
      .send({ startAt: "2026-06-01T09:00:00.000Z" });

    const round1Ends = res.body.data.entries
      .filter((e: { roundNumber: number }) => e.roundNumber === 1)
      .map(
        (e: { scheduledAt: string; estimatedDurationMinutes: number }) =>
          new Date(e.scheduledAt).getTime() + e.estimatedDurationMinutes * 60_000,
      );
    const round2Starts = res.body.data.entries
      .filter((e: { roundNumber: number }) => e.roundNumber === 2)
      .map((e: { scheduledAt: string }) => new Date(e.scheduledAt).getTime());
    expect(Math.min(...round2Starts)).toBeGreaterThanOrEqual(Math.max(...round1Ends));
  });

  it("5. a single tatami never runs two overlapping bouts", async () => {
    const { owner, competition, tournament } = await setup();
    await buildLockedDraw(owner, competition.id, tournament.id, 4);
    await createTatamis(tournament.id, 1);

    const res = await request(app)
      .post(`/api/v1/tournaments/${tournament.id}/schedule`)
      .set(auth(owner.accessToken))
      .send({ startAt: "2026-06-01T09:00:00.000Z" });

    const sorted = [...res.body.data.entries].sort(
      (a: { scheduledAt: string }, b: { scheduledAt: string }) =>
        new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime(),
    );
    for (let i = 1; i < sorted.length; i++) {
      const prevEnd =
        new Date(sorted[i - 1].scheduledAt).getTime() + sorted[i - 1].estimatedDurationMinutes * 60_000;
      expect(new Date(sorted[i].scheduledAt).getTime()).toBeGreaterThanOrEqual(prevEnd);
    }
  });

  it("6. a blocked period pushes the schedule's start past it", async () => {
    const { owner, competition, tournament } = await setup();
    await buildLockedDraw(owner, competition.id, tournament.id, 2);
    await createTatamis(tournament.id, 1);

    const res = await request(app)
      .post(`/api/v1/tournaments/${tournament.id}/schedule`)
      .set(auth(owner.accessToken))
      .send({
        startAt: "2026-06-01T09:00:00.000Z",
        blockedPeriods: [{ startAt: "2026-06-01T09:00:00.000Z", endAt: "2026-06-01T10:00:00.000Z" }],
      });
    expect(new Date(res.body.data.entries[0].scheduledAt).getTime()).toBe(
      new Date("2026-06-01T10:00:00.000Z").getTime(),
    );
  });

  it("7. generating a schedule with no available tatamis is rejected", async () => {
    const { owner, competition, tournament } = await setup();
    await buildLockedDraw(owner, competition.id, tournament.id);

    const res = await request(app)
      .post(`/api/v1/tournaments/${tournament.id}/schedule`)
      .set(auth(owner.accessToken))
      .send({ startAt: "2026-06-01T09:00:00.000Z" });
    expect(res.status).toBe(400);
  });

  it("8. a published schedule cannot be silently regenerated", async () => {
    const { owner, competition, tournament } = await setup();
    await buildLockedDraw(owner, competition.id, tournament.id);
    await createTatamis(tournament.id, 2);

    const created = await request(app)
      .post(`/api/v1/tournaments/${tournament.id}/schedule`)
      .set(auth(owner.accessToken))
      .send({ startAt: "2026-06-01T09:00:00.000Z" });
    await request(app).post(`/api/v1/schedules/${created.body.data.id}/publish`).set(auth(owner.accessToken));

    const res = await request(app)
      .post(`/api/v1/tournaments/${tournament.id}/schedule`)
      .set(auth(owner.accessToken))
      .send({ startAt: "2026-06-01T09:00:00.000Z" });
    expect(res.status).toBe(409);
  });

  it("9. an authorized revision (force) succeeds and increments the version", async () => {
    const { owner, competition, tournament } = await setup();
    await buildLockedDraw(owner, competition.id, tournament.id);
    await createTatamis(tournament.id, 2);

    const created = await request(app)
      .post(`/api/v1/tournaments/${tournament.id}/schedule`)
      .set(auth(owner.accessToken))
      .send({ startAt: "2026-06-01T09:00:00.000Z" });
    await request(app).post(`/api/v1/schedules/${created.body.data.id}/publish`).set(auth(owner.accessToken));

    const revised = await request(app)
      .post(`/api/v1/tournaments/${tournament.id}/schedule`)
      .set(auth(owner.accessToken))
      .send({ startAt: "2026-06-01T09:00:00.000Z", force: true });
    expect(revised.status).toBe(201);
    expect(revised.body.data.version).toBe(2);
  });

  it("10. an unrelated academy cannot generate a schedule for another organizer's tournament", async () => {
    const { competition, tournament } = await setup();
    const otherOwner = await registerAndLogin(app, "ACADEMY");
    await createAcademyWithOrganizer(otherOwner.userId);

    const res = await request(app)
      .post(`/api/v1/tournaments/${tournament.id}/schedule`)
      .set(auth(otherOwner.accessToken))
      .send({ startAt: "2026-06-01T09:00:00.000Z" });
    expect(res.status).toBe(403);
    expect(competition.id).toBeTruthy();
  });

  it("11. a delay creates a new version and preserves the previous version's history", async () => {
    const { owner, competition, tournament } = await setup();
    await buildLockedDraw(owner, competition.id, tournament.id, 4);
    const tatamis = await createTatamis(tournament.id, 2);

    const created = await request(app)
      .post(`/api/v1/tournaments/${tournament.id}/schedule`)
      .set(auth(owner.accessToken))
      .send({ startAt: "2026-06-01T09:00:00.000Z" });
    const originalScheduleId = created.body.data.id as string;
    await request(app).post(`/api/v1/schedules/${originalScheduleId}/publish`).set(auth(owner.accessToken));

    const delayed = await request(app)
      .post(`/api/v1/schedules/${originalScheduleId}/delay`)
      .set(auth(owner.accessToken))
      .send({ tatamiId: tatamis[0]!.id, delayMinutes: 20, reason: "Running behind" });
    expect(delayed.status).toBe(201);
    expect(delayed.body.data.version).toBe(2);
    expect(delayed.body.data.status).toBe("DELAYED");

    const originalEntries = await prisma.boutSchedule.findMany({ where: { scheduleId: originalScheduleId } });
    expect(originalEntries.length).toBeGreaterThan(0); // untouched, still there

    const original = await prisma.schedule.findUnique({ where: { id: originalScheduleId } });
    expect(original?.isActive).toBe(false);
  });
});
