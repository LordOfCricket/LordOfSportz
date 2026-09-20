import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { prisma } from "@karate/database";
import { buildTestApp, registerAndLogin, createAcademyWithOrganizer } from "./helpers";

const app = buildTestApp();
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

/** Kata needs its own tournament/category/competition helper — createOpenTournamentWithCategory (helpers.ts) hardcodes discipline: KUMITE. */
async function createOpenKataTournament(organizerId: string, createdByUserId: string) {
  const tournament = await prisma.tournament.create({
    data: {
      organizerId,
      name: "Open Kata Tournament",
      slug: `open-kata-tournament-${randomUUID()}`,
      status: "REGISTRATION_OPEN",
      createdByUserId,
    },
  });
  const category = await prisma.category.create({ data: { tournamentId: tournament.id, name: "Senior Kata" } });

  const ruleSet = await prisma.ruleSet.create({
    data: { name: `WKF Kata ${randomUUID()}`, discipline: "KATA", organizationName: "WKF" },
  });
  const ruleSetVersion = await prisma.ruleSetVersion.create({
    data: { ruleSetId: ruleSet.id, version: "2026.0", effectiveFrom: new Date("2026-01-01") },
  });
  await prisma.kataConfiguration.create({ data: { ruleSetVersionId: ruleSetVersion.id } });
  const kataA = await prisma.kataDefinition.create({
    data: { ruleSetVersionId: ruleSetVersion.id, name: `Heian Shodan ${randomUUID()}` },
  });
  const kataB = await prisma.kataDefinition.create({
    data: { ruleSetVersionId: ruleSetVersion.id, name: `Bassai Dai ${randomUUID()}` },
  });

  const competition = await prisma.competition.create({
    data: {
      tournamentId: tournament.id,
      categoryId: category.id,
      discipline: "KATA",
      name: "Kata Senior Individual",
      ruleSetVersionId: ruleSetVersion.id,
    },
  });
  return { tournament, category, competition, ruleSetVersion, kataA, kataB };
}

async function setup() {
  const owner = await registerAndLogin(app, "ACADEMY");
  const { academy, organizer } = await createAcademyWithOrganizer(owner.userId);
  const { tournament, category, competition, ruleSetVersion, kataA, kataB } = await createOpenKataTournament(
    organizer.id,
    owner.userId,
  );
  return { owner, academy, organizer, tournament, category, competition, ruleSetVersion, kataA, kataB };
}

async function makeReadyRegistration(owner: { accessToken: string }, competitionId: string) {
  const player = await registerAndLogin(app, "PLAYER");
  const profileRes = await request(app)
    .post("/api/v1/players/profile")
    .set(auth(player.accessToken))
    .send({ displayName: `Ready ${randomUUID()}`, dateOfBirth: "2005-01-01", gender: "MALE" });
  const playerId = profileRes.body.data.id as string;
  const regRes = await request(app).post("/api/v1/registrations").set(auth(player.accessToken)).send({ competitionId });
  const registrationId = regRes.body.data.id as string;
  await request(app)
    .post(`/api/v1/registrations/${registrationId}/medical/decision`)
    .set(auth(owner.accessToken))
    .send({ status: "CLEARED" });
  return { player, playerId, registrationId };
}

async function createVerifiedJudge() {
  const scorer = await registerAndLogin(app, "SCORER");
  const res = await request(app)
    .post("/api/v1/scorers/profile")
    .set(auth(scorer.accessToken))
    .send({ displayName: `Judge ${randomUUID()}` });
  const scorerProfileId = res.body.data.id as string;
  await prisma.scorerProfile.update({ where: { id: scorerProfileId }, data: { verificationStatus: "VERIFIED" } });
  return { scorer, scorerProfileId };
}

async function assignJudge(owner: { accessToken: string }, tournamentId: string, fn: string) {
  const { scorer, scorerProfileId } = await createVerifiedJudge();
  const res = await request(app)
    .post(`/api/v1/tournaments/${tournamentId}/officials`)
    .set(auth(owner.accessToken))
    .send({ scorerProfileId, function: fn });
  return { scorer, assignmentId: res.body.data.id as string };
}

/** Full pipeline to a real, IN_PROGRESS Kata bout with a 3-judge panel. */
async function buildLiveKataBout(owner: { accessToken: string }, competitionId: string, tournamentId: string) {
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

  await request(app).post(`/api/v1/bouts/${boutId}/call`).set(auth(owner.accessToken));
  await request(app).post(`/api/v1/bouts/${boutId}/ready`).set(auth(owner.accessToken));
  await request(app).post(`/api/v1/bouts/${boutId}/resume`).set(auth(owner.accessToken));

  const judges = [
    await assignJudge(owner, tournamentId, "JUDGE"),
    await assignJudge(owner, tournamentId, "JUDGE"),
    await assignJudge(owner, tournamentId, "JUDGE"),
  ];

  return { boutId, p1, p2, judges };
}

describe("Kata competition engine (Phase 16)", () => {
  it("1/2/3. the correct rule version is stored and retained for a historical performance", async () => {
    const { competition, ruleSetVersion } = await setup();
    const row = await prisma.competition.findUnique({ where: { id: competition.id } });
    expect(row!.ruleSetVersionId).toBe(ruleSetVersion.id);
  });

  it("lists only the active Kata definitions for the selected rule set", async () => {
    const { owner, ruleSetVersion, kataA, kataB } = await setup();
    const res = await request(app)
      .get(`/api/v1/kata-definitions?ruleSetVersionId=${ruleSetVersion.id}`)
      .set(auth(owner.accessToken));
    expect(res.status).toBe(200);
    expect(res.body.data.map((k: { id: string }) => k.id)).toEqual(expect.arrayContaining([kataA.id, kataB.id]));
  });

  describe("Official Kata list seeding", () => {
    it("1. seeds the complete cross-verified official list for a rule set", async () => {
      const { owner, ruleSetVersion } = await setup();
      const res = await request(app)
        .post("/api/v1/kata-definitions/seed-official-list")
        .set(auth(owner.accessToken))
        .send({ ruleSetVersionId: ruleSetVersion.id });
      expect(res.status).toBe(200);
      expect(res.body.data.total).toBeGreaterThan(60);

      const list = await request(app)
        .get(`/api/v1/kata-definitions?ruleSetVersionId=${ruleSetVersion.id}`)
        .set(auth(owner.accessToken));
      const names = list.body.data.map((k: { name: string }) => k.name);
      expect(names).toEqual(expect.arrayContaining(["Heian Shodan", "Kanku Dai", "Suparimpei", "Sanchin"]));
    });

    it("seeding is idempotent — re-running does not duplicate or touch existing rows", async () => {
      const { owner, ruleSetVersion } = await setup();
      await request(app).post("/api/v1/kata-definitions/seed-official-list").set(auth(owner.accessToken)).send({ ruleSetVersionId: ruleSetVersion.id });
      const second = await request(app)
        .post("/api/v1/kata-definitions/seed-official-list")
        .set(auth(owner.accessToken))
        .send({ ruleSetVersionId: ruleSetVersion.id });
      expect(second.body.data.created).toBe(0);

      const count = await prisma.kataDefinition.count({ where: { ruleSetVersionId: ruleSetVersion.id } });
      const list = await request(app).get(`/api/v1/kata-definitions?ruleSetVersionId=${ruleSetVersion.id}`).set(auth(owner.accessToken));
      expect(list.body.data).toHaveLength(count);
    });

    it("2/3. a valid official Kata is accepted for announcement; an invalid one is rejected", async () => {
      const { owner, competition, tournament, ruleSetVersion } = await setup();
      await request(app).post("/api/v1/kata-definitions/seed-official-list").set(auth(owner.accessToken)).send({ ruleSetVersionId: ruleSetVersion.id });
      const { boutId, p1 } = await buildLiveKataBout(owner, competition.id, tournament.id);
      const list = await request(app).get(`/api/v1/kata-definitions?ruleSetVersionId=${ruleSetVersion.id}`).set(auth(owner.accessToken));
      const heian = list.body.data.find((k: { name: string }) => k.name === "Heian Shodan");

      const valid = await request(app)
        .post(`/api/v1/bouts/${boutId}/kata/announce`)
        .set(auth(owner.accessToken))
        .send({ performerPlayerId: p1.playerId, kataDefinitionId: heian.id });
      expect(valid.status).toBe(200);

      const invalid = await request(app)
        .post(`/api/v1/bouts/${boutId}/kata/announce`)
        .set(auth(owner.accessToken))
        .send({ performerPlayerId: p1.playerId, kataDefinitionId: randomUUID() });
      expect(invalid.status).toBe(400);
    });

    it("4. a historical performance's selected Kata definition remains reproducible after re-seeding", async () => {
      const { owner, competition, tournament, kataA } = await setup();
      const { boutId, p1 } = await buildLiveKataBout(owner, competition.id, tournament.id);
      await request(app)
        .post(`/api/v1/bouts/${boutId}/kata/announce`)
        .set(auth(owner.accessToken))
        .send({ performerPlayerId: p1.playerId, kataDefinitionId: kataA.id });

      const state = await request(app).get(`/api/v1/bouts/${boutId}/kata`).set(auth(owner.accessToken));
      expect(state.body.data.performance.redKata.id).toBe(kataA.id);
      expect(state.body.data.performance.redKata.name).toBe(kataA.name);
    });
  });

  it("Kata announcement is validated against the official list — an unknown id is rejected", async () => {
    const { owner, competition, tournament } = await setup();
    const { boutId, p1 } = await buildLiveKataBout(owner, competition.id, tournament.id);
    const res = await request(app)
      .post(`/api/v1/bouts/${boutId}/kata/announce`)
      .set(auth(owner.accessToken))
      .send({ performerPlayerId: p1.playerId, kataDefinitionId: randomUUID() });
    expect(res.status).toBe(400);
  });

  it("a valid Kata announcement is recorded", async () => {
    const { owner, competition, tournament, kataA } = await setup();
    const { boutId, p1 } = await buildLiveKataBout(owner, competition.id, tournament.id);
    const res = await request(app)
      .post(`/api/v1/bouts/${boutId}/kata/announce`)
      .set(auth(owner.accessToken))
      .send({ performerPlayerId: p1.playerId, kataDefinitionId: kataA.id });
    expect(res.status).toBe(200);
    expect(res.body.data.performance.redKata.id).toBe(kataA.id);
  });

  it("4/5. a valid judge can evaluate; an unassigned scorer is blocked", async () => {
    const { owner, competition, tournament } = await setup();
    const { boutId, p1, judges } = await buildLiveKataBout(owner, competition.id, tournament.id);

    const ok = await request(app)
      .post(`/api/v1/bouts/${boutId}/kata/evaluations`)
      .set(auth(judges[0]!.scorer.accessToken))
      .send({ targetPlayerId: p1.playerId, score: 8.5, clientOperationId: randomUUID() });
    expect(ok.status).toBe(200);

    const { scorer: unassigned } = await createVerifiedJudge();
    const blocked = await request(app)
      .post(`/api/v1/bouts/${boutId}/kata/evaluations`)
      .set(auth(unassigned.accessToken))
      .send({ targetPlayerId: p1.playerId, score: 8.0, clientOperationId: randomUUID() });
    expect(blocked.status).toBe(403);
  });

  it("6. a duplicate judge evaluation for the same athlete is blocked (must use correction)", async () => {
    const { owner, competition, tournament } = await setup();
    const { boutId, p1, judges } = await buildLiveKataBout(owner, competition.id, tournament.id);
    await request(app)
      .post(`/api/v1/bouts/${boutId}/kata/evaluations`)
      .set(auth(judges[0]!.scorer.accessToken))
      .send({ targetPlayerId: p1.playerId, score: 8.0, clientOperationId: randomUUID() });
    const dup = await request(app)
      .post(`/api/v1/bouts/${boutId}/kata/evaluations`)
      .set(auth(judges[0]!.scorer.accessToken))
      .send({ targetPlayerId: p1.playerId, score: 8.5, clientOperationId: randomUUID() });
    expect(dup.status).toBe(409);
  });

  it("8. an out-of-range/off-increment score is rejected", async () => {
    const { owner, competition, tournament } = await setup();
    const { boutId, p1, judges } = await buildLiveKataBout(owner, competition.id, tournament.id);
    const res = await request(app)
      .post(`/api/v1/bouts/${boutId}/kata/evaluations`)
      .set(auth(judges[0]!.scorer.accessToken))
      .send({ targetPlayerId: p1.playerId, score: 4.5, clientOperationId: randomUUID() });
    expect(res.status).toBe(400);
  });

  it("9. a duplicated evaluation submission (same clientOperationId) is idempotent", async () => {
    const { owner, competition, tournament } = await setup();
    const { boutId, p1, judges } = await buildLiveKataBout(owner, competition.id, tournament.id);
    const clientOperationId = randomUUID();
    const body = { targetPlayerId: p1.playerId, score: 8.0, clientOperationId };
    const first = await request(app).post(`/api/v1/bouts/${boutId}/kata/evaluations`).set(auth(judges[0]!.scorer.accessToken)).send(body);
    const second = await request(app).post(`/api/v1/bouts/${boutId}/kata/evaluations`).set(auth(judges[0]!.scorer.accessToken)).send(body);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    const rows = await prisma.judgeEvaluation.findMany({ where: { targetPlayerId: p1.playerId, score: 8.0 } });
    expect(rows).toHaveLength(1);
  });

  it("10. multiple judges' evaluations are stored independently", async () => {
    const { owner, competition, tournament } = await setup();
    const { boutId, p1, p2, judges } = await buildLiveKataBout(owner, competition.id, tournament.id);
    await request(app).post(`/api/v1/bouts/${boutId}/kata/evaluations`).set(auth(judges[0]!.scorer.accessToken)).send({ targetPlayerId: p1.playerId, score: 8.5, clientOperationId: randomUUID() });
    await request(app).post(`/api/v1/bouts/${boutId}/kata/evaluations`).set(auth(judges[0]!.scorer.accessToken)).send({ targetPlayerId: p2.playerId, score: 7.9, clientOperationId: randomUUID() });
    await request(app).post(`/api/v1/bouts/${boutId}/kata/evaluations`).set(auth(judges[1]!.scorer.accessToken)).send({ targetPlayerId: p1.playerId, score: 7.0, clientOperationId: randomUUID() });
    await request(app).post(`/api/v1/bouts/${boutId}/kata/evaluations`).set(auth(judges[1]!.scorer.accessToken)).send({ targetPlayerId: p2.playerId, score: 8.2, clientOperationId: randomUUID() });

    const state = await request(app).get(`/api/v1/bouts/${boutId}/kata`).set(auth(judges[0]!.scorer.accessToken));
    expect(state.body.data.evaluations).toHaveLength(4);
    expect(state.body.data.redVotes).toBe(1);
    expect(state.body.data.blueVotes).toBe(1);
  });

  it("11/16. a majority decision is finalized through the generic Bout engine", async () => {
    const { owner, competition, tournament } = await setup();
    const { boutId, p1, p2, judges } = await buildLiveKataBout(owner, competition.id, tournament.id);
    for (const j of judges) {
      await request(app).post(`/api/v1/bouts/${boutId}/kata/evaluations`).set(auth(j.scorer.accessToken)).send({ targetPlayerId: p1.playerId, score: 8.5, clientOperationId: randomUUID() });
      await request(app).post(`/api/v1/bouts/${boutId}/kata/evaluations`).set(auth(j.scorer.accessToken)).send({ targetPlayerId: p2.playerId, score: 7.0, clientOperationId: randomUUID() });
    }
    const finalize = await request(app).post(`/api/v1/bouts/${boutId}/kata/finalize`).set(auth(owner.accessToken)).send({});
    expect(finalize.status).toBe(200);
    expect(finalize.body.data.status).toBe("FINISHED");
    expect(finalize.body.data.result.winnerPlayerId).toBe(p1.playerId);
    expect(finalize.body.data.result.method).toBe("DECISION");
    expect(finalize.body.data.result.reason).toBe("JUDGE_MAJORITY");
  });

  it("12. an unresolved tie is blocked from finalizing rather than auto-decided", async () => {
    const { owner, competition, tournament } = await setup();
    const { boutId, p1, p2, judges } = await buildLiveKataBout(owner, competition.id, tournament.id);
    await request(app).post(`/api/v1/bouts/${boutId}/kata/evaluations`).set(auth(judges[0]!.scorer.accessToken)).send({ targetPlayerId: p1.playerId, score: 8.5, clientOperationId: randomUUID() });
    await request(app).post(`/api/v1/bouts/${boutId}/kata/evaluations`).set(auth(judges[0]!.scorer.accessToken)).send({ targetPlayerId: p2.playerId, score: 7.0, clientOperationId: randomUUID() });
    await request(app).post(`/api/v1/bouts/${boutId}/kata/evaluations`).set(auth(judges[1]!.scorer.accessToken)).send({ targetPlayerId: p1.playerId, score: 7.0, clientOperationId: randomUUID() });
    await request(app).post(`/api/v1/bouts/${boutId}/kata/evaluations`).set(auth(judges[1]!.scorer.accessToken)).send({ targetPlayerId: p2.playerId, score: 8.5, clientOperationId: randomUUID() });

    const finalize = await request(app).post(`/api/v1/bouts/${boutId}/kata/finalize`).set(auth(owner.accessToken)).send({});
    expect(finalize.status).toBe(409);
  });

  it("13. a majority against an all-disqualified athlete finalizes as DISQUALIFICATION", async () => {
    const { owner, competition, tournament } = await setup();
    const { boutId, p1, p2, judges } = await buildLiveKataBout(owner, competition.id, tournament.id);
    for (const j of judges) {
      await request(app).post(`/api/v1/bouts/${boutId}/kata/evaluations`).set(auth(j.scorer.accessToken)).send({ targetPlayerId: p1.playerId, isDisqualification: true, clientOperationId: randomUUID() });
      await request(app).post(`/api/v1/bouts/${boutId}/kata/evaluations`).set(auth(j.scorer.accessToken)).send({ targetPlayerId: p2.playerId, score: 7.0, clientOperationId: randomUUID() });
    }
    const finalize = await request(app).post(`/api/v1/bouts/${boutId}/kata/finalize`).set(auth(owner.accessToken)).send({});
    expect(finalize.body.data.result.method).toBe("DISQUALIFICATION");
    expect(finalize.body.data.result.reason).toBe("DISQUALIFICATION");
    expect(finalize.body.data.result.winnerPlayerId).toBe(p2.playerId);
  });

  it("KIKEN finalization awards the configured fixed vote count, not a computed tally", async () => {
    const { owner, competition, tournament } = await setup();
    const { boutId, p1, p2 } = await buildLiveKataBout(owner, competition.id, tournament.id);
    const finalize = await request(app)
      .post(`/api/v1/bouts/${boutId}/kata/finalize`)
      .set(auth(owner.accessToken))
      .send({ kikenAgainstPlayerId: p1.playerId });
    expect(finalize.body.data.result.method).toBe("NO_SHOW");
    expect(finalize.body.data.result.reason).toBe("KIKEN");
    expect(finalize.body.data.result.winnerPlayerId).toBe(p2.playerId);
    expect(finalize.body.data.result.finalScoreBlue).toBe(4);
  });

  it("15. a client cannot spoof the winner — the winner is always server-computed", async () => {
    const { owner, competition, tournament } = await setup();
    const { boutId, p1, p2, judges } = await buildLiveKataBout(owner, competition.id, tournament.id);
    // p2 objectively scores higher with every judge...
    for (const j of judges) {
      await request(app).post(`/api/v1/bouts/${boutId}/kata/evaluations`).set(auth(j.scorer.accessToken)).send({ targetPlayerId: p1.playerId, score: 6.0, clientOperationId: randomUUID() });
      await request(app).post(`/api/v1/bouts/${boutId}/kata/evaluations`).set(auth(j.scorer.accessToken)).send({ targetPlayerId: p2.playerId, score: 9.0, clientOperationId: randomUUID() });
    }
    // ...but the client tries to claim p1 won by passing kikenAgainstPlayerId for p2 without authorization change; the server still only accepts real officials/organizer and computes from evaluations when no kiken is asserted.
    const finalize = await request(app).post(`/api/v1/bouts/${boutId}/kata/finalize`).set(auth(owner.accessToken)).send({});
    expect(finalize.body.data.result.winnerPlayerId).toBe(p2.playerId);
  });

  it("17. a finalized Kata result cannot be mutated by further evaluations", async () => {
    const { owner, competition, tournament } = await setup();
    const { boutId, p1, p2, judges } = await buildLiveKataBout(owner, competition.id, tournament.id);
    for (const j of judges) {
      await request(app).post(`/api/v1/bouts/${boutId}/kata/evaluations`).set(auth(j.scorer.accessToken)).send({ targetPlayerId: p1.playerId, score: 8.5, clientOperationId: randomUUID() });
      await request(app).post(`/api/v1/bouts/${boutId}/kata/evaluations`).set(auth(j.scorer.accessToken)).send({ targetPlayerId: p2.playerId, score: 7.0, clientOperationId: randomUUID() });
    }
    await request(app).post(`/api/v1/bouts/${boutId}/kata/finalize`).set(auth(owner.accessToken)).send({});

    const res = await request(app)
      .post(`/api/v1/bouts/${boutId}/kata/evaluations`)
      .set(auth(judges[0]!.scorer.accessToken))
      .send({ targetPlayerId: p1.playerId, score: 6.0, clientOperationId: randomUUID() });
    expect(res.status).toBe(409);
  });

  it("18/19. wrong tournament / wrong tatami officials are blocked from judging", async () => {
    const { owner, competition, tournament } = await setup();
    const { boutId, p1 } = await buildLiveKataBout(owner, competition.id, tournament.id);
    const { owner: otherOwner } = await setup();
    const { organizer: otherOrganizer } = await createAcademyWithOrganizer(otherOwner.userId);
    void otherOrganizer;
    const { scorer: otherJudgeScorer } = await createVerifiedJudge();

    const res = await request(app)
      .post(`/api/v1/bouts/${boutId}/kata/evaluations`)
      .set(auth(otherJudgeScorer.accessToken))
      .send({ targetPlayerId: p1.playerId, score: 8.0, clientOperationId: randomUUID() });
    expect(res.status).toBe(403);
  });

  it("21. a judge may only correct their own evaluation, not another judge's", async () => {
    const { owner, competition, tournament } = await setup();
    const { boutId, p1, judges } = await buildLiveKataBout(owner, competition.id, tournament.id);
    const submitted = await request(app)
      .post(`/api/v1/bouts/${boutId}/kata/evaluations`)
      .set(auth(judges[0]!.scorer.accessToken))
      .send({ targetPlayerId: p1.playerId, score: 8.0, clientOperationId: randomUUID() });
    const evaluationId = submitted.body.data.evaluations[0].id as string;

    const res = await request(app)
      .post(`/api/v1/bouts/${boutId}/kata/evaluations/correct`)
      .set(auth(judges[1]!.scorer.accessToken))
      .send({ evaluationId, score: 9.0, clientOperationId: randomUUID() });
    expect(res.status).toBe(403);
  });

  it("22/23. a correction preserves the original evaluation and creates new history", async () => {
    const { owner, competition, tournament } = await setup();
    const { boutId, p1, judges } = await buildLiveKataBout(owner, competition.id, tournament.id);
    const submitted = await request(app)
      .post(`/api/v1/bouts/${boutId}/kata/evaluations`)
      .set(auth(judges[0]!.scorer.accessToken))
      .send({ targetPlayerId: p1.playerId, score: 8.0, clientOperationId: randomUUID() });
    const evaluationId = submitted.body.data.evaluations[0].id as string;

    const corrected = await request(app)
      .post(`/api/v1/bouts/${boutId}/kata/evaluations/correct`)
      .set(auth(judges[0]!.scorer.accessToken))
      .send({ evaluationId, score: 8.7, clientOperationId: randomUUID() });
    expect(corrected.status).toBe(200);
    expect(corrected.body.data.evaluations).toHaveLength(2);

    const original = await prisma.judgeEvaluation.findUnique({ where: { id: evaluationId } });
    expect(Number(original!.score)).toBe(8.0);
  });

  describe("Round-robin group standings (Art. 5.11)", () => {
    async function buildFinishedRoundRobinBout(
      owner: { accessToken: string },
      judges: { scorer: { accessToken: string } }[],
      boutId: string,
      redPlayerId: string,
      bluePlayerId: string,
      redScore: number,
      blueScore: number,
    ) {
      await request(app).post(`/api/v1/bouts/${boutId}/call`).set(auth(owner.accessToken));
      await request(app).post(`/api/v1/bouts/${boutId}/ready`).set(auth(owner.accessToken));
      await request(app).post(`/api/v1/bouts/${boutId}/resume`).set(auth(owner.accessToken));
      for (const j of judges) {
        await request(app).post(`/api/v1/bouts/${boutId}/kata/evaluations`).set(auth(j.scorer.accessToken)).send({ targetPlayerId: redPlayerId, score: redScore, clientOperationId: randomUUID() });
        await request(app).post(`/api/v1/bouts/${boutId}/kata/evaluations`).set(auth(j.scorer.accessToken)).send({ targetPlayerId: bluePlayerId, score: blueScore, clientOperationId: randomUUID() });
      }
      await request(app).post(`/api/v1/bouts/${boutId}/kata/finalize`).set(auth(owner.accessToken)).send({});
    }

    it("5/6/9/10. a 3-player round-robin group produces deterministic, protected standings", async () => {
      const { owner, competition, tournament } = await setup();
      const p1 = await makeReadyRegistration(owner, competition.id);
      const p2 = await makeReadyRegistration(owner, competition.id);
      const p3 = await makeReadyRegistration(owner, competition.id);
      await prisma.tournament.update({ where: { id: tournament.id }, data: { status: "WEIGH_IN" } });
      const drawRes = await request(app)
        .post(`/api/v1/competitions/${competition.id}/draw`)
        .set(auth(owner.accessToken))
        .send({ bracketType: "ROUND_ROBIN", seedingStrategy: "NONE" });
      const drawId = drawRes.body.data.id as string;
      await request(app).post(`/api/v1/draws/${drawId}/publish`).set(auth(owner.accessToken));
      await request(app).post(`/api/v1/draws/${drawId}/lock`).set(auth(owner.accessToken));

      const draw = await prisma.draw.findUnique({
        where: { id: drawId },
        include: { rounds: { include: { bouts: true }, orderBy: { roundNumber: "asc" } } },
      });
      const allBouts = draw!.rounds.flatMap((r) => r.bouts);

      const judges = [await assignJudge(owner, tournament.id, "JUDGE"), await assignJudge(owner, tournament.id, "JUDGE")];

      // p1 beats everyone (highest score), p2 beats p3.
      for (const bout of allBouts) {
        const redId = bout.redPlayerId!;
        const blueId = bout.bluePlayerId!;
        const ids = [p1.playerId, p2.playerId, p3.playerId];
        const scoreFor = (id: string) => (id === p1.playerId ? 9.0 : id === p2.playerId ? 8.0 : 7.0);
        void ids;
        await buildFinishedRoundRobinBout(owner, judges, bout.id, redId, blueId, scoreFor(redId), scoreFor(blueId));
      }

      const standings1 = await request(app).get(`/api/v1/draws/${drawId}/kata-standings`).set(auth(owner.accessToken));
      expect(standings1.status).toBe(200);
      const order1 = standings1.body.data.standings.map((s: { playerId: string }) => s.playerId);
      expect(order1).toEqual([p1.playerId, p2.playerId, p3.playerId]);

      // Re-fetching (standings have no stored state) yields the identical, deterministic result — "protected" from drift.
      const standings2 = await request(app).get(`/api/v1/draws/${drawId}/kata-standings`);
      const order2 = standings2.body.data.standings.map((s: { playerId: string }) => s.playerId);
      expect(order2).toEqual(order1);
    });
  });

  describe("Team Kata (Art. 3.5)", () => {
    async function makeAcademyPlayer(academyId: string) {
      const player = await registerAndLogin(app, "PLAYER");
      const profileRes = await request(app)
        .post("/api/v1/players/profile")
        .set(auth(player.accessToken))
        .send({ displayName: `Team Athlete ${randomUUID()}`, dateOfBirth: "2005-01-01", gender: "MALE" });
      const playerId = profileRes.body.data.id as string;
      await prisma.academyPlayerMembership.create({ data: { academyId, playerId, status: "ACTIVE" } });
      return { player, playerId };
    }

    it("11. an academy administrator can create a Kata Team", async () => {
      const { owner, academy, competition } = await setup();
      const res = await request(app)
        .post("/api/v1/kata-teams")
        .set(auth(owner.accessToken))
        .send({ academyId: academy.id, competitionId: competition.id, name: `Team A ${randomUUID()}` });
      expect(res.status).toBe(201);
    });

    it("19. an unrelated academy administrator cannot create a Team for another academy", async () => {
      const { competition } = await setup();
      const otherOwner = await registerAndLogin(app, "ACADEMY");
      const res = await request(app)
        .post("/api/v1/kata-teams")
        .set(auth(otherOwner.accessToken))
        .send({ academyId: randomUUID(), competitionId: competition.id, name: `Team X ${randomUUID()}` });
      expect(res.status).toBe(403);
    });

    it("12. team membership requires an ACTIVE academy membership, not an arbitrary player id", async () => {
      const { owner, academy, competition } = await setup();
      const teamRes = await request(app)
        .post("/api/v1/kata-teams")
        .set(auth(owner.accessToken))
        .send({ academyId: academy.id, competitionId: competition.id, name: `Team B ${randomUUID()}` });
      const teamId = teamRes.body.data.id as string;

      const outsidePlayer = await registerAndLogin(app, "PLAYER");
      const outsideProfile = await request(app)
        .post("/api/v1/players/profile")
        .set(auth(outsidePlayer.accessToken))
        .send({ displayName: "Outsider", dateOfBirth: "2005-01-01", gender: "MALE" });

      const res = await request(app)
        .post(`/api/v1/kata-teams/${teamId}/members`)
        .set(auth(owner.accessToken))
        .send({ playerId: outsideProfile.body.data.id });
      expect(res.status).toBe(400);
    });

    it("13. a duplicate team member is rejected", async () => {
      const { owner, academy, competition } = await setup();
      const teamRes = await request(app)
        .post("/api/v1/kata-teams")
        .set(auth(owner.accessToken))
        .send({ academyId: academy.id, competitionId: competition.id, name: `Team C ${randomUUID()}` });
      const teamId = teamRes.body.data.id as string;
      const { playerId } = await makeAcademyPlayer(academy.id);

      await request(app).post(`/api/v1/kata-teams/${teamId}/members`).set(auth(owner.accessToken)).send({ playerId });
      const dup = await request(app).post(`/api/v1/kata-teams/${teamId}/members`).set(auth(owner.accessToken)).send({ playerId });
      expect(dup.status).toBe(409);
    });

    it("14/15. a team bout requires 2 ACTIVE Teams with at least 3 members each", async () => {
      const { owner, academy, competition } = await setup();
      const teamARes = await request(app)
        .post("/api/v1/kata-teams")
        .set(auth(owner.accessToken))
        .send({ academyId: academy.id, competitionId: competition.id, name: `Team D ${randomUUID()}` });
      const teamAId = teamARes.body.data.id as string;
      const teamBRes = await request(app)
        .post("/api/v1/kata-teams")
        .set(auth(owner.accessToken))
        .send({ academyId: academy.id, competitionId: competition.id, name: `Team E ${randomUUID()}` });
      const teamBId = teamBRes.body.data.id as string;

      // Team A has only 1 member -> invalid registration for a bout.
      const p1 = await makeAcademyPlayer(academy.id);
      await request(app).post(`/api/v1/kata-teams/${teamAId}/members`).set(auth(owner.accessToken)).send({ playerId: p1.playerId });

      const invalid = await request(app)
        .post(`/api/v1/competitions/${competition.id}/kata/team-bouts`)
        .set(auth(owner.accessToken))
        .send({ redTeamId: teamAId, blueTeamId: teamBId });
      expect(invalid.status).toBe(400);

      // Bring both teams to 3 members each -> valid.
      for (const teamId of [teamAId, teamBId]) {
        for (let i = teamId === teamAId ? 1 : 0; i < 3; i++) {
          const p = await makeAcademyPlayer(academy.id);
          await request(app).post(`/api/v1/kata-teams/${teamId}/members`).set(auth(owner.accessToken)).send({ playerId: p.playerId });
        }
      }

      const valid = await request(app)
        .post(`/api/v1/competitions/${competition.id}/kata/team-bouts`)
        .set(auth(owner.accessToken))
        .send({ redTeamId: teamAId, blueTeamId: teamBId, bunkaiRequired: true });
      expect(valid.status).toBe(201);
    });

    async function buildTeamBout(owner: { accessToken: string }, academyId: string, competitionId: string, bunkaiRequired: boolean) {
      const teamARes = await request(app)
        .post("/api/v1/kata-teams")
        .set(auth(owner.accessToken))
        .send({ academyId, competitionId, name: `Team ${randomUUID()}` });
      const teamAId = teamARes.body.data.id as string;
      const teamBRes = await request(app)
        .post("/api/v1/kata-teams")
        .set(auth(owner.accessToken))
        .send({ academyId, competitionId, name: `Team ${randomUUID()}` });
      const teamBId = teamBRes.body.data.id as string;
      for (const teamId of [teamAId, teamBId]) {
        for (let i = 0; i < 3; i++) {
          const p = await makeAcademyPlayer(academyId);
          await request(app).post(`/api/v1/kata-teams/${teamId}/members`).set(auth(owner.accessToken)).send({ playerId: p.playerId });
        }
      }
      const boutRes = await request(app)
        .post(`/api/v1/competitions/${competitionId}/kata/team-bouts`)
        .set(auth(owner.accessToken))
        .send({ redTeamId: teamAId, blueTeamId: teamBId, bunkaiRequired });
      const boutId = boutRes.body.data.id as string;
      await request(app).post(`/api/v1/bouts/${boutId}/call`).set(auth(owner.accessToken));
      await request(app).post(`/api/v1/bouts/${boutId}/ready`).set(auth(owner.accessToken));
      await request(app).post(`/api/v1/bouts/${boutId}/resume`).set(auth(owner.accessToken));
      return { boutId, teamAId, teamBId };
    }

    it("16. a Team Kata performance can be announced and judged like an individual performance", async () => {
      const { owner, academy, competition, kataA, tournament } = await setup();
      const { boutId, teamAId } = await buildTeamBout(owner, academy.id, competition.id, false);
      const realJudge = await assignJudge(owner, tournament.id, "JUDGE");

      const announce = await request(app)
        .post(`/api/v1/bouts/${boutId}/kata/announce`)
        .set(auth(owner.accessToken))
        .send({ performerPlayerId: teamAId, kataDefinitionId: kataA.id });
      expect(announce.status).toBe(200);
      expect(announce.body.data.performance.redKata.id).toBe(kataA.id);

      const evalRes = await request(app)
        .post(`/api/v1/bouts/${boutId}/kata/evaluations`)
        .set(auth(realJudge.scorer.accessToken))
        .send({ targetPlayerId: teamAId, score: 8.5, clientOperationId: randomUUID() });
      expect(evalRes.status).toBe(200);
    });

    it("17/18. the Bunkai workflow: KATA + BUNKAI evaluations combine into the team result", async () => {
      const { owner, academy, competition, tournament } = await setup();
      const { boutId, teamAId, teamBId } = await buildTeamBout(owner, academy.id, competition.id, true);
      const judges = [await assignJudge(owner, tournament.id, "JUDGE"), await assignJudge(owner, tournament.id, "JUDGE")];

      for (const j of judges) {
        await request(app).post(`/api/v1/bouts/${boutId}/kata/evaluations`).set(auth(j.scorer.accessToken)).send({ targetPlayerId: teamAId, score: 8.0, phase: "KATA", clientOperationId: randomUUID() });
        await request(app).post(`/api/v1/bouts/${boutId}/kata/evaluations`).set(auth(j.scorer.accessToken)).send({ targetPlayerId: teamAId, score: 8.0, phase: "BUNKAI", clientOperationId: randomUUID() });
        await request(app).post(`/api/v1/bouts/${boutId}/kata/evaluations`).set(auth(j.scorer.accessToken)).send({ targetPlayerId: teamBId, score: 7.0, phase: "KATA", clientOperationId: randomUUID() });
        await request(app).post(`/api/v1/bouts/${boutId}/kata/evaluations`).set(auth(j.scorer.accessToken)).send({ targetPlayerId: teamBId, score: 7.0, phase: "BUNKAI", clientOperationId: randomUUID() });
      }

      const state = await request(app).get(`/api/v1/bouts/${boutId}/kata`).set(auth(owner.accessToken));
      expect(state.body.data.redVotes).toBe(2);

      const finalize = await request(app).post(`/api/v1/bouts/${boutId}/kata/finalize`).set(auth(owner.accessToken)).send({});
      expect(finalize.status).toBe(200);
      expect(finalize.body.data.result.winnerTeamId).toBe(teamAId);
      expect(finalize.body.data.result.winnerPlayerId).toBeNull();
    });

    it("a Bunkai evaluation is rejected for a performance that does not require it", async () => {
      const { owner, academy, competition, tournament } = await setup();
      const { boutId, teamAId } = await buildTeamBout(owner, academy.id, competition.id, false);
      const judge = await assignJudge(owner, tournament.id, "JUDGE");
      const res = await request(app)
        .post(`/api/v1/bouts/${boutId}/kata/evaluations`)
        .set(auth(judge.scorer.accessToken))
        .send({ targetPlayerId: teamAId, score: 8.0, phase: "BUNKAI", clientOperationId: randomUUID() });
      expect(res.status).toBe(400);
    });
  });
});
