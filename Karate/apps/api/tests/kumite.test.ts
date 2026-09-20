import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
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

/** Creates a real RuleSetVersion + KumiteConfiguration and attaches it to the competition — used only by tests that need non-default config (videoReviewEnabled/twoJudgeMode). */
async function withKumiteConfig(competitionId: string, overrides: { videoReviewEnabled?: boolean; twoJudgeMode?: boolean }) {
  const ruleSet = await prisma.ruleSet.create({
    data: { name: `WKF Kumite ${randomUUID()}`, discipline: "KUMITE", organizationName: "WKF" },
  });
  const version = await prisma.ruleSetVersion.create({
    data: { ruleSetId: ruleSet.id, version: "2026.00", effectiveFrom: new Date("2026-01-01") },
  });
  await prisma.kumiteConfiguration.create({
    data: { ruleSetVersionId: version.id, videoReviewEnabled: overrides.videoReviewEnabled ?? false, twoJudgeMode: overrides.twoJudgeMode ?? false },
  });
  await prisma.competition.update({ where: { id: competitionId }, data: { ruleSetVersionId: version.id } });
}

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
    .send({ displayName: `Ready ${randomUUID()}`, dateOfBirth: "2005-01-01", gender: "MALE" });
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

async function createVerifiedScorer() {
  const scorer = await registerAndLogin(app, "SCORER");
  const res = await request(app)
    .post("/api/v1/scorers/profile")
    .set(auth(scorer.accessToken))
    .send({ displayName: `Scorer ${randomUUID()}` });
  const scorerProfileId = res.body.data.id as string;
  await prisma.scorerProfile.update({ where: { id: scorerProfileId }, data: { verificationStatus: "VERIFIED" } });
  return { scorer, scorerProfileId };
}

async function assignOfficial(
  owner: { accessToken: string },
  tournamentId: string,
  fn: string,
) {
  const { scorer, scorerProfileId } = await createVerifiedScorer();
  const res = await request(app)
    .post(`/api/v1/tournaments/${tournamentId}/officials`)
    .set(auth(owner.accessToken))
    .send({ scorerProfileId, function: fn });
  return { scorer, assignmentId: res.body.data.id as string };
}

/** Full pipeline to a real, IN_PROGRESS Kumite bout with a full 5-official panel assigned. */
async function buildLiveKumiteBout(owner: { accessToken: string }, competitionId: string, tournamentId: string) {
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

  const referee = await assignOfficial(owner, tournamentId, "REFEREE");
  const judges = [
    await assignOfficial(owner, tournamentId, "JUDGE"),
    await assignOfficial(owner, tournamentId, "JUDGE"),
    await assignOfficial(owner, tournamentId, "JUDGE"),
    await assignOfficial(owner, tournamentId, "JUDGE"),
  ];

  return { boutId, p1, p2, referee, judges };
}

describe("Kumite competition engine (Phase 15)", () => {
  it("1. two judges agreeing on YUKO awards it once the referee submits the signals", async () => {
    const { owner, competition, tournament } = await setup();
    const { boutId, p1, referee, judges } = await buildLiveKumiteBout(owner, competition.id, tournament.id);

    const res = await request(app)
      .post(`/api/v1/bouts/${boutId}/kumite/score`)
      .set(auth(referee.scorer.accessToken))
      .send({
        signals: [
          { officialAssignmentId: judges[0]!.assignmentId, targetPlayerId: p1.playerId, scoreType: "YUKO" },
          { officialAssignmentId: judges[1]!.assignmentId, targetPlayerId: p1.playerId, scoreType: "YUKO" },
        ],
        clientOperationId: randomUUID(),
      });

    expect(res.status).toBe(200);
    expect(res.body.data.state.redScore + res.body.data.state.blueScore).toBe(1);
  });

  it("2. a single judge signal does not award a score", async () => {
    const { owner, competition, tournament } = await setup();
    const { boutId, p1, referee, judges } = await buildLiveKumiteBout(owner, competition.id, tournament.id);

    const res = await request(app)
      .post(`/api/v1/bouts/${boutId}/kumite/score`)
      .set(auth(referee.scorer.accessToken))
      .send({
        signals: [{ officialAssignmentId: judges[0]!.assignmentId, targetPlayerId: p1.playerId, scoreType: "IPPON" }],
        clientOperationId: randomUUID(),
      });
    expect(res.status).toBe(400); // fails min(2) schema validation
  });

  it("45. a scorer with no official assignment for this bout is blocked", async () => {
    const { owner, competition, tournament } = await setup();
    const { boutId, p1, judges } = await buildLiveKumiteBout(owner, competition.id, tournament.id);
    const { scorer: unassignedScorer } = await createVerifiedScorer();

    const res = await request(app)
      .post(`/api/v1/bouts/${boutId}/kumite/score`)
      .set(auth(unassignedScorer.accessToken))
      .send({
        signals: [
          { officialAssignmentId: judges[0]!.assignmentId, targetPlayerId: p1.playerId, scoreType: "YUKO" },
          { officialAssignmentId: judges[1]!.assignmentId, targetPlayerId: p1.playerId, scoreType: "YUKO" },
        ],
        clientOperationId: randomUUID(),
      });
    expect(res.status).toBe(403);
  });

  it("46. a JUDGE (not a REFEREE) cannot submit the aggregated score decision", async () => {
    const { owner, competition, tournament } = await setup();
    const { boutId, p1, judges } = await buildLiveKumiteBout(owner, competition.id, tournament.id);

    const res = await request(app)
      .post(`/api/v1/bouts/${boutId}/kumite/score`)
      .set(auth(judges[0]!.scorer.accessToken))
      .send({
        signals: [
          { officialAssignmentId: judges[0]!.assignmentId, targetPlayerId: p1.playerId, scoreType: "YUKO" },
          { officialAssignmentId: judges[1]!.assignmentId, targetPlayerId: p1.playerId, scoreType: "YUKO" },
        ],
        clientOperationId: randomUUID(),
      });
    expect(res.status).toBe(403);
  });

  it("48. an official from a different tournament cannot score this bout", async () => {
    const { owner, competition, tournament } = await setup();
    const { boutId, p1, judges } = await buildLiveKumiteBout(owner, competition.id, tournament.id);
    const { owner: otherOwner } = await setup();
    const otherReferee = await assignOfficial(otherOwner, (await createOpenTournamentWithCategory((await createAcademyWithOrganizer(otherOwner.userId)).organizer.id, otherOwner.userId)).tournament.id, "REFEREE");

    const res = await request(app)
      .post(`/api/v1/bouts/${boutId}/kumite/score`)
      .set(auth(otherReferee.scorer.accessToken))
      .send({
        signals: [
          { officialAssignmentId: judges[0]!.assignmentId, targetPlayerId: p1.playerId, scoreType: "YUKO" },
          { officialAssignmentId: judges[1]!.assignmentId, targetPlayerId: p1.playerId, scoreType: "YUKO" },
        ],
        clientOperationId: randomUUID(),
      });
    expect(res.status).toBe(403);
  });

  it("31/32. duplicated score submissions (same clientOperationId) never produce two events", async () => {
    const { owner, competition, tournament } = await setup();
    const { boutId, p1, referee, judges } = await buildLiveKumiteBout(owner, competition.id, tournament.id);
    const clientOperationId = randomUUID();
    const body = {
      signals: [
        { officialAssignmentId: judges[0]!.assignmentId, targetPlayerId: p1.playerId, scoreType: "IPPON" },
        { officialAssignmentId: judges[1]!.assignmentId, targetPlayerId: p1.playerId, scoreType: "IPPON" },
      ],
      clientOperationId,
    };

    const first = await request(app).post(`/api/v1/bouts/${boutId}/kumite/score`).set(auth(referee.scorer.accessToken)).send(body);
    const second = await request(app).post(`/api/v1/bouts/${boutId}/kumite/score`).set(auth(referee.scorer.accessToken)).send(body);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(first.body.data.state.redScore).toBe(3);
    expect(second.body.data.state.redScore).toBe(3);

    const events = await prisma.scoreEvent.findMany({ where: { boutId, eventType: "IPPON" } });
    expect(events).toHaveLength(1);
  });

  it("20. a penalty is applied and visible in state", async () => {
    const { owner, competition, tournament } = await setup();
    const { boutId, p1, referee } = await buildLiveKumiteBout(owner, competition.id, tournament.id);

    const res = await request(app)
      .post(`/api/v1/bouts/${boutId}/kumite/penalty`)
      .set(auth(referee.scorer.accessToken))
      .send({ targetPlayerId: p1.playerId, penaltyType: "CHUI", reasonCode: "JOGAI", clientOperationId: randomUUID() });

    expect(res.status).toBe(200);
    expect(res.body.data.state.redPenalties).toEqual(["CHUI"]);
  });

  it("21. a 4th minor infraction escalates CHUI to HANSOKU_CHUI", async () => {
    const { owner, competition, tournament } = await setup();
    const { boutId, p1, referee } = await buildLiveKumiteBout(owner, competition.id, tournament.id);

    for (let i = 0; i < 3; i++) {
      await request(app)
        .post(`/api/v1/bouts/${boutId}/kumite/penalty`)
        .set(auth(referee.scorer.accessToken))
        .send({ targetPlayerId: p1.playerId, penaltyType: "CHUI", reasonCode: "JOGAI", clientOperationId: randomUUID() });
    }
    const fourth = await request(app)
      .post(`/api/v1/bouts/${boutId}/kumite/penalty`)
      .set(auth(referee.scorer.accessToken))
      .send({ targetPlayerId: p1.playerId, penaltyType: "CHUI", reasonCode: "JOGAI", clientOperationId: randomUUID() });

    expect(fourth.body.data.state.redPenalties).toEqual(["CHUI", "CHUI", "CHUI", "HANSOKU_CHUI"]);
  });

  it("7. an 8-point clear lead can be finalized as a win before time-up", async () => {
    const { owner, competition, tournament } = await setup();
    const { boutId, p1, referee, judges } = await buildLiveKumiteBout(owner, competition.id, tournament.id);

    for (let i = 0; i < 3; i++) {
      await request(app)
        .post(`/api/v1/bouts/${boutId}/kumite/score`)
        .set(auth(referee.scorer.accessToken))
        .send({
          signals: [
            { officialAssignmentId: judges[0]!.assignmentId, targetPlayerId: p1.playerId, scoreType: "IPPON" },
            { officialAssignmentId: judges[1]!.assignmentId, targetPlayerId: p1.playerId, scoreType: "IPPON" },
          ],
          clientOperationId: randomUUID(),
        });
    }
    const finalize = await request(app)
      .post(`/api/v1/bouts/${boutId}/kumite/finalize`)
      .set(auth(referee.scorer.accessToken))
      .send({});

    expect(finalize.status).toBe(200);
    expect(finalize.body.data.status).toBe("FINISHED");
    expect(finalize.body.data.result.winnerPlayerId).toBe(p1.playerId);
    expect(finalize.body.data.result.reason).toBe("CLEAR_LEAD");
  });

  it("11. HANSOKU finalization awards the win to the opponent", async () => {
    const { owner, competition, tournament } = await setup();
    const { boutId, p2, referee } = await buildLiveKumiteBout(owner, competition.id, tournament.id);

    const finalize = await request(app)
      .post(`/api/v1/bouts/${boutId}/kumite/finalize`)
      .set(auth(referee.scorer.accessToken))
      .send({ disqualifiedPlayerId: p2.playerId, disqualificationType: "HANSOKU" });

    expect(finalize.status).toBe(200);
    expect(finalize.body.data.result.method).toBe("DISQUALIFICATION");
    expect(finalize.body.data.result.reason).toBe("HANSOKU");
  });

  it("42/43. a finalized bout cannot mutate scoring further", async () => {
    const { owner, competition, tournament } = await setup();
    const { boutId, p1, referee } = await buildLiveKumiteBout(owner, competition.id, tournament.id);
    await request(app)
      .post(`/api/v1/bouts/${boutId}/kumite/finalize`)
      .set(auth(referee.scorer.accessToken))
      .send({ disqualifiedPlayerId: p1.playerId, disqualificationType: "SHIKKAKU" });

    const scoreAttempt = await request(app)
      .post(`/api/v1/bouts/${boutId}/kumite/score`)
      .set(auth(referee.scorer.accessToken))
      .send({
        signals: [
          { officialAssignmentId: referee.assignmentId, targetPlayerId: p1.playerId, scoreType: "YUKO" },
          { officialAssignmentId: referee.assignmentId, targetPlayerId: p1.playerId, scoreType: "YUKO" },
        ],
        clientOperationId: randomUUID(),
      });
    expect(scoreAttempt.status).toBe(409);
  });

  it("10. a tied bout with no superiority requires HANTEI votes before it can be finalized", async () => {
    const { owner, competition, tournament } = await setup();
    const { boutId, referee, judges } = await buildLiveKumiteBout(owner, competition.id, tournament.id);

    const blocked = await request(app)
      .post(`/api/v1/bouts/${boutId}/kumite/finalize`)
      .set(auth(referee.scorer.accessToken))
      .send({});
    expect(blocked.status).toBe(409);

    const p1 = "placeholder"; // votes target real player ids resolved below
    const boutRow = await prisma.bout.findUnique({ where: { id: boutId } });
    const votes = [
      { officialAssignmentId: referee.assignmentId, votedForPlayerId: boutRow!.redPlayerId! },
      { officialAssignmentId: judges[0]!.assignmentId, votedForPlayerId: boutRow!.redPlayerId! },
      { officialAssignmentId: judges[1]!.assignmentId, votedForPlayerId: boutRow!.redPlayerId! },
      { officialAssignmentId: judges[2]!.assignmentId, votedForPlayerId: boutRow!.bluePlayerId! },
      { officialAssignmentId: judges[3]!.assignmentId, votedForPlayerId: boutRow!.bluePlayerId! },
    ];
    void p1;
    const hantei = await request(app)
      .post(`/api/v1/bouts/${boutId}/kumite/hantei`)
      .set(auth(referee.scorer.accessToken))
      .send({ votes, clientOperationId: randomUUID() });
    expect(hantei.status).toBe(200);

    const finalize = await request(app)
      .post(`/api/v1/bouts/${boutId}/kumite/finalize`)
      .set(auth(referee.scorer.accessToken))
      .send({});
    expect(finalize.status).toBe(200);
    expect(finalize.body.data.result.winnerPlayerId).toBe(boutRow!.redPlayerId);
    expect(finalize.body.data.result.reason).toBe("HANTEI");
  });

  it("25/26. the clock is server-authoritative and cannot be started twice", async () => {
    const { owner, competition, tournament } = await setup();
    const { boutId, referee } = await buildLiveKumiteBout(owner, competition.id, tournament.id);

    const started = await request(app).post(`/api/v1/bouts/${boutId}/kumite/clock/start`).set(auth(referee.scorer.accessToken));
    expect(started.status).toBe(200);
    expect(started.body.data.clock.running).toBe(true);

    const startedAgain = await request(app).post(`/api/v1/bouts/${boutId}/kumite/clock/start`).set(auth(referee.scorer.accessToken));
    expect(startedAgain.status).toBe(409);

    const paused = await request(app).post(`/api/v1/bouts/${boutId}/kumite/clock/pause`).set(auth(referee.scorer.accessToken));
    expect(paused.status).toBe(200);
    expect(paused.body.data.clock.running).toBe(false);
  });

  it("any authenticated user (e.g. a player) can view live Kumite state", async () => {
    const { owner, competition, tournament } = await setup();
    const { boutId, p1 } = await buildLiveKumiteBout(owner, competition.id, tournament.id);

    const res = await request(app).get(`/api/v1/bouts/${boutId}/kumite`).set(auth(p1.player.accessToken));
    expect(res.status).toBe(200);
    expect(res.body.data.state).toBeTruthy();
  });

  it("12. simultaneous scoring in the same referee decision grants SENSHU to neither athlete", async () => {
    const { owner, competition, tournament } = await setup();
    const { boutId, p1, p2, referee, judges } = await buildLiveKumiteBout(owner, competition.id, tournament.id);

    const res = await request(app)
      .post(`/api/v1/bouts/${boutId}/kumite/score`)
      .set(auth(referee.scorer.accessToken))
      .send({
        signals: [
          { officialAssignmentId: judges[0]!.assignmentId, targetPlayerId: p1.playerId, scoreType: "YUKO" },
          { officialAssignmentId: judges[1]!.assignmentId, targetPlayerId: p1.playerId, scoreType: "YUKO" },
          { officialAssignmentId: judges[2]!.assignmentId, targetPlayerId: p2.playerId, scoreType: "YUKO" },
          { officialAssignmentId: judges[3]!.assignmentId, targetPlayerId: p2.playerId, scoreType: "YUKO" },
        ],
        clientOperationId: randomUUID(),
      });

    expect(res.status).toBe(200);
    expect(res.body.data.state.senshu).toBeNull();
    expect(res.body.data.state.redScore).toBe(1);
    expect(res.body.data.state.blueScore).toBe(1);
  });

  describe("Two-Judge Youth League mode (Appendix 5)", () => {
    it("standard mode: the Referee's own signal does not count toward the 2-signal threshold", async () => {
      const { owner, competition, tournament } = await setup();
      await withKumiteConfig(competition.id, { twoJudgeMode: false });
      const { boutId, p1, referee, judges } = await buildLiveKumiteBout(owner, competition.id, tournament.id);

      const res = await request(app)
        .post(`/api/v1/bouts/${boutId}/kumite/score`)
        .set(auth(referee.scorer.accessToken))
        .send({
          signals: [
            { officialAssignmentId: referee.assignmentId, targetPlayerId: p1.playerId, scoreType: "IPPON" },
            { officialAssignmentId: judges[0]!.assignmentId, targetPlayerId: p1.playerId, scoreType: "IPPON" },
          ],
          clientOperationId: randomUUID(),
        });
      // Only 1 real Judge signal counts in standard mode -> below the 2-signal threshold.
      expect(res.status).toBe(409);
    });

    it("two-judge mode: a Judge + the Referee's own signal together award the score (Appendix 5, point 3)", async () => {
      const { owner, competition, tournament } = await setup();
      await withKumiteConfig(competition.id, { twoJudgeMode: true });
      const { boutId, p1, referee, judges } = await buildLiveKumiteBout(owner, competition.id, tournament.id);

      const res = await request(app)
        .post(`/api/v1/bouts/${boutId}/kumite/score`)
        .set(auth(referee.scorer.accessToken))
        .send({
          signals: [
            { officialAssignmentId: referee.assignmentId, targetPlayerId: p1.playerId, scoreType: "IPPON" },
            { officialAssignmentId: judges[0]!.assignmentId, targetPlayerId: p1.playerId, scoreType: "IPPON" },
          ],
          clientOperationId: randomUUID(),
        });
      expect(res.status).toBe(200);
      expect(res.body.data.state.redScore).toBe(3);
      expect(res.body.data.config.twoJudgeMode).toBe(true);
    });
  });

  describe("Video Review (Art. 14)", () => {
    async function affiliateCoachWithPlayer(academyId: string, playerId: string) {
      const coach = await registerAndLogin(app, "COACH");
      const profileRes = await request(app)
        .post("/api/v1/coaches/profile")
        .set(auth(coach.accessToken))
        .send({ displayName: `Coach ${randomUUID()}` });
      await prisma.academyCoachAffiliation.create({
        data: { academyId, coachId: profileRes.body.data.id, status: "ACTIVE", startedAt: new Date() },
      });
      await prisma.academyPlayerMembership.create({
        data: { academyId, playerId, status: "ACTIVE", startedAt: new Date() },
      });
      return coach;
    }

    it("6. an unauthorized coach (not this athlete's coach) cannot request video review", async () => {
      const { owner, academy, competition, tournament } = await setup();
      await withKumiteConfig(competition.id, { videoReviewEnabled: true });
      const { boutId, p1 } = await buildLiveKumiteBout(owner, competition.id, tournament.id);
      void academy;
      const unrelatedCoach = await registerAndLogin(app, "COACH");
      await request(app)
        .post("/api/v1/coaches/profile")
        .set(auth(unrelatedCoach.accessToken))
        .send({ displayName: `Coach ${randomUUID()}` });

      const res = await request(app)
        .post(`/api/v1/bouts/${boutId}/kumite/video-review`)
        .set(auth(unrelatedCoach.accessToken))
        .send({ requestedForPlayerId: p1.playerId, requestedScoreType: "IPPON" });
      expect(res.status).toBe(403);
    });

    it("7/8/9. a valid request, a valid UPHELD decision, and preserved history", async () => {
      const { owner, academy, competition, tournament } = await setup();
      await withKumiteConfig(competition.id, { videoReviewEnabled: true });
      const { boutId, p1, referee } = await buildLiveKumiteBout(owner, competition.id, tournament.id);
      const coach = await affiliateCoachWithPlayer(academy.id, p1.playerId);
      const { scorer: vrj, assignmentId: vrjAssignmentId } = await assignOfficial(owner, tournament.id, "VIDEO_REVIEW_JUDGE");

      const requestRes = await request(app)
        .post(`/api/v1/bouts/${boutId}/kumite/video-review`)
        .set(auth(coach.accessToken))
        .send({ requestedForPlayerId: p1.playerId, requestedScoreType: "IPPON" });
      expect(requestRes.status).toBe(201);
      const requestId = requestRes.body.data.videoReviewRequests[0].id as string;

      const decideRes = await request(app)
        .post(`/api/v1/bouts/${boutId}/kumite/video-review/${requestId}/decide`)
        .set(auth(vrj.accessToken))
        .send({ status: "UPHELD", awardedScoreType: "IPPON", clientOperationId: randomUUID() });
      expect(decideRes.status).toBe(200);
      expect(decideRes.body.data.state.redScore).toBe(3);
      expect(decideRes.body.data.videoReviewRequests[0].status).toBe("UPHELD");
      void vrjAssignmentId;

      const state = await request(app).get(`/api/v1/bouts/${boutId}/kumite`).set(auth(coach.accessToken));
      expect(state.body.data.videoReviewRequests).toHaveLength(1);
    });

    it("an UPHELD video review that confirms the opponent also scored strips the original SENSHU (Art. 12.2.9)", async () => {
      const { owner, academy, competition, tournament } = await setup();
      await withKumiteConfig(competition.id, { videoReviewEnabled: true });
      const { boutId, p1, p2, referee, judges } = await buildLiveKumiteBout(owner, competition.id, tournament.id);
      const coachForP2 = await affiliateCoachWithPlayer(academy.id, p2.playerId);
      const { scorer: vrj } = await assignOfficial(owner, tournament.id, "VIDEO_REVIEW_JUDGE");

      // RED (p1) scores first and unopposed -> holds SENSHU.
      const scored = await request(app)
        .post(`/api/v1/bouts/${boutId}/kumite/score`)
        .set(auth(referee.scorer.accessToken))
        .send({
          signals: [
            { officialAssignmentId: judges[0]!.assignmentId, targetPlayerId: p1.playerId, scoreType: "YUKO" },
            { officialAssignmentId: judges[1]!.assignmentId, targetPlayerId: p1.playerId, scoreType: "YUKO" },
          ],
          clientOperationId: randomUUID(),
        });
      expect(scored.body.data.state.senshu).toBe("RED");

      // p2's Coach requests a review claiming the judges missed p2's own score in that same exchange.
      const requestRes = await request(app)
        .post(`/api/v1/bouts/${boutId}/kumite/video-review`)
        .set(auth(coachForP2.accessToken))
        .send({ requestedForPlayerId: p2.playerId, requestedScoreType: "YUKO" });
      const requestId = requestRes.body.data.videoReviewRequests[0].id as string;

      const decideRes = await request(app)
        .post(`/api/v1/bouts/${boutId}/kumite/video-review/${requestId}/decide`)
        .set(auth(vrj.accessToken))
        .send({ status: "UPHELD", awardedScoreType: "YUKO", clientOperationId: randomUUID() });

      expect(decideRes.status).toBe(200);
      expect(decideRes.body.data.state.redScore).toBe(1);
      expect(decideRes.body.data.state.blueScore).toBe(1);
      // Both scored in the same original exchange once corrected -> neither retains "first unopposed advantage".
      expect(decideRes.body.data.state.senshu).toBeNull();
    });

    it("a REJECTED request strips the Coach's right to request again in this bout", async () => {
      const { owner, academy, competition, tournament } = await setup();
      await withKumiteConfig(competition.id, { videoReviewEnabled: true });
      const { boutId, p1 } = await buildLiveKumiteBout(owner, competition.id, tournament.id);
      const coach = await affiliateCoachWithPlayer(academy.id, p1.playerId);
      const { scorer: vrj } = await assignOfficial(owner, tournament.id, "VIDEO_REVIEW_JUDGE");

      const first = await request(app)
        .post(`/api/v1/bouts/${boutId}/kumite/video-review`)
        .set(auth(coach.accessToken))
        .send({ requestedForPlayerId: p1.playerId });
      const requestId = first.body.data.videoReviewRequests[0].id as string;
      await request(app)
        .post(`/api/v1/bouts/${boutId}/kumite/video-review/${requestId}/decide`)
        .set(auth(vrj.accessToken))
        .send({ status: "REJECTED", clientOperationId: randomUUID() });

      const second = await request(app)
        .post(`/api/v1/bouts/${boutId}/kumite/video-review`)
        .set(auth(coach.accessToken))
        .send({ requestedForPlayerId: p1.playerId });
      expect(second.status).toBe(409);
    });

    it("video review is rejected outright when disabled for the competition", async () => {
      const { owner, academy, competition, tournament } = await setup();
      const { boutId, p1 } = await buildLiveKumiteBout(owner, competition.id, tournament.id);
      const coach = await affiliateCoachWithPlayer(academy.id, p1.playerId);

      const res = await request(app)
        .post(`/api/v1/bouts/${boutId}/kumite/video-review`)
        .set(auth(coach.accessToken))
        .send({ requestedForPlayerId: p1.playerId });
      expect(res.status).toBe(409);
    });
  });
});
