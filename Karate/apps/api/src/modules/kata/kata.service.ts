import { prisma } from "@karate/database";
import type { OfficialFunction } from "@karate/types";
import { AuthorizationError, ConflictError, NotFoundError, ValidationError } from "@karate/shared";
import {
  activeEvaluations,
  computeJudgeVotes,
  computeWinner,
  isKataRepetitionAllowed,
  isValidScore,
  mergeKataAndBunkaiEvaluations,
  type KataConfig,
  type RawJudgeEvaluation,
} from "../../domain/kataEngine";
import { OFFICIAL_KATA_LIST } from "../../domain/officialKataList";
import { computeRoundRobinStandings, type StandingBoutResult } from "../../domain/kataStandings";
import { applyBoutResult } from "../bouts/bouts.service";
import { assertUserCanManageTournament, getTournamentWithOrganizer } from "../tournaments/tournaments.service";
import { recordAudit } from "../../lib/audit";
import { emitCompetitionEvent } from "../../lib/realtime";
import { processFinalizedResult } from "../stats/stats.service";

const DEFAULT_CONFIG: KataConfig = { scoreMin: 5.0, scoreMax: 10.0, scoreIncrement: 0.1, kikenVotes: 4 };

function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === "P2002";
}

const BOUT_INCLUDE = {
  round: {
    select: {
      roundNumber: true,
      draw: {
        select: {
          competitionId: true,
          competition: { select: { tournamentId: true, ruleSetVersionId: true } },
        },
      },
    },
  },
  boutSchedules: { where: { schedule: { isActive: true } }, select: { tatami: { select: { id: true } } } },
  redTeam: { select: { id: true, name: true } },
  blueTeam: { select: { id: true, name: true } },
  kataPerformance: {
    include: {
      redKataDefinition: true,
      blueKataDefinition: true,
      evaluations: { orderBy: { sequence: "asc" as const } },
    },
  },
} as const;

type KataBout = NonNullable<Awaited<ReturnType<typeof loadBoutForKata>>>;

async function loadBoutForKata(boutId: string) {
  const bout = await prisma.bout.findUnique({ where: { id: boutId }, include: BOUT_INCLUDE });
  if (!bout) throw new NotFoundError("Bout", boutId);
  return bout;
}

function assertBoutHasTwoParticipants(bout: KataBout): void {
  const hasPlayers = Boolean(bout.redPlayerId && bout.bluePlayerId);
  const hasTeams = Boolean(bout.redTeamId && bout.blueTeamId);
  if (!hasPlayers && !hasTeams) {
    throw new ConflictError("This bout has a bye or an undecided slot and has no Kata performance.");
  }
}

/**
 * The generic "two sides" of a Kata bout — a player id pair for individual
 * Kata, or a KataTeam id pair for Team Kata (Art. 3.5). Every downstream
 * function (announce, evaluate, vote, finalize) is written against these
 * generic ids so the same code serves both without duplication.
 */
function resolveBoutSides(bout: KataBout): { redId: string; blueId: string; isTeam: boolean } {
  if (bout.redTeamId && bout.blueTeamId) {
    return { redId: bout.redTeamId, blueId: bout.blueTeamId, isTeam: true };
  }
  if (bout.redPlayerId && bout.bluePlayerId) {
    return { redId: bout.redPlayerId, blueId: bout.bluePlayerId, isTeam: false };
  }
  throw new ConflictError("This bout has a bye or an undecided slot and has no Kata performance.");
}

async function ensureKataPerformance(boutId: string) {
  return prisma.kataPerformance.upsert({
    where: { boutId },
    create: { boutId },
    update: {},
    include: { redKataDefinition: true, blueKataDefinition: true, evaluations: { orderBy: { sequence: "asc" } } },
  });
}

async function getConfig(ruleSetVersionId: string | null): Promise<KataConfig> {
  if (!ruleSetVersionId) return DEFAULT_CONFIG;
  const config = await prisma.kataConfiguration.findUnique({ where: { ruleSetVersionId } });
  if (!config) return DEFAULT_CONFIG;
  return {
    scoreMin: Number(config.scoreMin),
    scoreMax: Number(config.scoreMax),
    scoreIncrement: Number(config.scoreIncrement),
    kikenVotes: config.kikenVotes,
  };
}

/** Same pattern as kumite.service.ts's resolveOfficialAssignment — scoped to this bout's tournament/competition/tatami, never client-trusted. */
async function resolveOfficialAssignment(bout: KataBout, actorUserId: string, allowed: OfficialFunction[]) {
  const scorerProfile = await prisma.scorerProfile.findUnique({ where: { userId: actorUserId } });
  if (!scorerProfile) {
    throw new AuthorizationError("Only an assigned official can perform this action.");
  }
  const tournamentId = bout.round.draw.competition.tournamentId;
  const competitionId = bout.round.draw.competitionId;
  const tatamiId = bout.boutSchedules[0]?.tatami?.id ?? null;

  const assignments = await prisma.officialAssignment.findMany({
    where: {
      scorerProfileId: scorerProfile.id,
      tournamentId,
      status: { in: ["ASSIGNED", "CONFIRMED"] },
      function: { in: allowed },
    },
  });
  const match = assignments.find(
    (a) => (!a.competitionId || a.competitionId === competitionId) && (!a.tatamiId || a.tatamiId === tatamiId),
  );
  if (!match) {
    throw new AuthorizationError("You do not hold an applicable official function assignment for this bout.");
  }
  return match;
}

async function tryResolveMyOfficialAssignment(bout: KataBout, actorUserId: string | null) {
  if (!actorUserId) return null;
  const scorerProfile = await prisma.scorerProfile.findUnique({ where: { userId: actorUserId } });
  if (!scorerProfile) return null;
  const tournamentId = bout.round.draw.competition.tournamentId;
  const competitionId = bout.round.draw.competitionId;
  const tatamiId = bout.boutSchedules[0]?.tatami?.id ?? null;
  const assignments = await prisma.officialAssignment.findMany({
    where: { scorerProfileId: scorerProfile.id, tournamentId, status: { in: ["ASSIGNED", "CONFIRMED"] } },
  });
  return (
    assignments.find(
      (a) => (!a.competitionId || a.competitionId === competitionId) && (!a.tatamiId || a.tatamiId === tatamiId),
    ) ?? null
  );
}

type PerformanceEvaluations = NonNullable<KataBout["kataPerformance"]>["evaluations"];

/** The engine's "targetPlayerId" is a generic target-entity id — for Team Kata it holds the KataTeam id instead (never both null; validated on write). */
function toRawEvaluations(evaluations: PerformanceEvaluations): RawJudgeEvaluation[] {
  return evaluations.map((e) => ({
    id: e.id,
    officialAssignmentId: e.officialAssignmentId,
    targetPlayerId: e.targetPlayerId ?? e.targetTeamId ?? "",
    phase: e.phase,
    score: e.score ? Number(e.score) : null,
    isDisqualification: e.isDisqualification,
    correctionOfId: e.correctionOfId,
    sequence: e.sequence,
  }));
}

export async function listKataDefinitions(ruleSetVersionId: string) {
  return prisma.kataDefinition.findMany({
    where: { ruleSetVersionId, isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, styleNote: true },
  });
}

/**
 * Populates KataDefinition with the best-available official/cross-verified
 * list (see domain/officialKataList.ts for provenance) for one RuleSetVersion.
 * Idempotent — safe to re-run; existing rows are left untouched (name is
 * unique per ruleSetVersionId), so historical performances that reference a
 * definition id are never affected.
 */
export async function seedOfficialKataList(ruleSetVersionId: string) {
  const ruleSetVersion = await prisma.ruleSetVersion.findUnique({ where: { id: ruleSetVersionId } });
  if (!ruleSetVersion) {
    throw new NotFoundError("RuleSetVersion", ruleSetVersionId);
  }
  const existing = await prisma.kataDefinition.findMany({ where: { ruleSetVersionId }, select: { name: true } });
  const existingNames = new Set(existing.map((e) => e.name));
  const toCreate = OFFICIAL_KATA_LIST.filter((entry) => !existingNames.has(entry.name));
  if (toCreate.length > 0) {
    await prisma.kataDefinition.createMany({
      data: toCreate.map((entry) => ({ ruleSetVersionId, name: entry.name, styleNote: entry.styleNote })),
    });
  }
  return { total: OFFICIAL_KATA_LIST.length, created: toCreate.length };
}

/**
 * Organizer-only, same authorization boundary as bout call/ready (bouts.service.ts) —
 * recording the officially-announced Kata is an administrative fact, not a judging act.
 */
export async function announceKata(
  boutId: string,
  actorUserId: string,
  input: { performerPlayerId: string; kataDefinitionId: string },
) {
  const bout = await loadBoutForKata(boutId);
  assertBoutHasTwoParticipants(bout);
  const { redId, blueId, isTeam } = resolveBoutSides(bout);
  const tournament = await getTournamentWithOrganizer(bout.round.draw.competition.tournamentId);
  await assertUserCanManageTournament(tournament, actorUserId);

  if (input.performerPlayerId !== redId && input.performerPlayerId !== blueId) {
    throw new ValidationError("performerPlayerId must be one of this bout's two participants.");
  }
  const ruleSetVersionId = bout.round.draw.competition.ruleSetVersionId;
  const kata = await prisma.kataDefinition.findUnique({ where: { id: input.kataDefinitionId } });
  if (!kata || !kata.isActive || kata.ruleSetVersionId !== ruleSetVersionId) {
    throw new ValidationError("This Kata is not on the official list for this competition's rule set.");
  }

  // Art. 5.2.1 — no Kata twice in a row, none more than twice total across the competition.
  const competitionId = bout.round.draw.competitionId;
  const priorPerformances = await prisma.kataPerformance.findMany({
    where: {
      bout: { round: { draw: { competitionId } } },
      OR: [{ redKataDefinitionId: { not: null } }, { blueKataDefinitionId: { not: null } }],
    },
    include: {
      bout: {
        select: {
          redPlayerId: true,
          bluePlayerId: true,
          redTeamId: true,
          blueTeamId: true,
          round: { select: { roundNumber: true } },
        },
      },
    },
    orderBy: { bout: { round: { roundNumber: "asc" } } },
  });
  const priorKataIds = priorPerformances
    .filter((p) => p.boutId !== boutId)
    .map((p) => {
      if (p.bout.redPlayerId === input.performerPlayerId || p.bout.redTeamId === input.performerPlayerId) return p.redKataDefinitionId;
      if (p.bout.bluePlayerId === input.performerPlayerId || p.bout.blueTeamId === input.performerPlayerId) return p.blueKataDefinitionId;
      return null;
    })
    .filter((id): id is string => id !== null);
  const config = await prisma.kataConfiguration.findUnique({ where: { ruleSetVersionId: ruleSetVersionId ?? "" } });
  if (!isKataRepetitionAllowed(priorKataIds, input.kataDefinitionId, { maxKataRepeats: config?.maxKataRepeats ?? 2 })) {
    throw new ConflictError("This Kata cannot be performed again by this Athlete/Team at this point (Art. 5.2.1).");
  }

  void isTeam;
  const isRed = input.performerPlayerId === redId;
  await prisma.kataPerformance.upsert({
    where: { boutId },
    create: {
      boutId,
      ...(isRed
        ? { redKataDefinitionId: input.kataDefinitionId, redAnnouncedAt: new Date() }
        : { blueKataDefinitionId: input.kataDefinitionId, blueAnnouncedAt: new Date() }),
    },
    update: isRed
      ? { redKataDefinitionId: input.kataDefinitionId, redAnnouncedAt: new Date() }
      : { blueKataDefinitionId: input.kataDefinitionId, blueAnnouncedAt: new Date() },
  });
  await recordAudit(actorUserId, "KATA_ANNOUNCED", "Bout", boutId, {
    performerPlayerId: input.performerPlayerId,
    kataDefinitionId: input.kataDefinitionId,
  });
  return getKataState(boutId, actorUserId);
}

export async function getKataState(boutId: string, actorUserId: string | null = null) {
  const bout = await loadBoutForKata(boutId);
  const performance = bout.kataPerformance ?? (await ensureKataPerformance(boutId));
  const config = await getConfig(bout.round.draw.competition.ruleSetVersionId);

  let redId: string | null = null;
  let blueId: string | null = null;
  try {
    ({ redId, blueId } = resolveBoutSides(bout));
  } catch {
    // bye/undecided slot — no sides to compute votes for yet.
  }
  let rawEvaluations = toRawEvaluations(performance.evaluations);
  if (performance.bunkaiRequired) {
    rawEvaluations = mergeKataAndBunkaiEvaluations(rawEvaluations);
  }
  const votes = redId && blueId ? computeJudgeVotes(rawEvaluations, redId, blueId) : [];

  const tournamentId = bout.round.draw.competition.tournamentId;
  const competitionId = bout.round.draw.competitionId;
  const tatamiId = bout.boutSchedules[0]?.tatami?.id ?? null;
  const panelAssignments = await prisma.officialAssignment.findMany({
    where: { tournamentId, status: { in: ["ASSIGNED", "CONFIRMED"] }, function: "JUDGE" },
    select: { id: true, competitionId: true, tatamiId: true, scorerProfile: { select: { displayName: true } } },
  });
  const panelOfficials = panelAssignments
    .filter((a) => (!a.competitionId || a.competitionId === competitionId) && (!a.tatamiId || a.tatamiId === tatamiId))
    .map((a) => ({ id: a.id, displayName: a.scorerProfile.displayName }));
  const myAssignment = await tryResolveMyOfficialAssignment(bout, actorUserId);
  let isOrganizer = false;
  if (actorUserId) {
    try {
      const tournament = await getTournamentWithOrganizer(bout.round.draw.competition.tournamentId);
      await assertUserCanManageTournament(tournament, actorUserId);
      isOrganizer = true;
    } catch {
      isOrganizer = false;
    }
  }

  return {
    boutId: bout.id,
    status: bout.status,
    redPlayerId: bout.redPlayerId,
    bluePlayerId: bout.bluePlayerId,
    redTeam: bout.redTeam,
    blueTeam: bout.blueTeam,
    ruleSetVersionId: bout.round.draw.competition.ruleSetVersionId,
    config: { scoreMin: config.scoreMin, scoreMax: config.scoreMax, scoreIncrement: config.scoreIncrement },
    myOfficialFunction: myAssignment?.function ?? null,
    myOfficialAssignmentId: myAssignment?.id ?? null,
    canManage: isOrganizer || myAssignment?.function === "TATAMI_MANAGER",
    panelOfficials,
    performance: {
      redKata: performance.redKataDefinition ? { id: performance.redKataDefinition.id, name: performance.redKataDefinition.name } : null,
      blueKata: performance.blueKataDefinition ? { id: performance.blueKataDefinition.id, name: performance.blueKataDefinition.name } : null,
      bunkaiRequired: performance.bunkaiRequired,
    },
    evaluations: performance.evaluations.map((e) => ({
      id: e.id,
      officialAssignmentId: e.officialAssignmentId,
      targetPlayerId: e.targetPlayerId,
      targetTeamId: e.targetTeamId,
      phase: e.phase,
      score: e.score ? Number(e.score) : null,
      isDisqualification: e.isDisqualification,
      correctionOfId: e.correctionOfId,
      recordedAt: e.recordedAt,
    })),
    votes,
    redVotes: votes.filter((v) => v.votedForPlayerId === redId).length,
    blueVotes: votes.filter((v) => v.votedForPlayerId === blueId).length,
  };
}

export async function submitJudgeEvaluation(
  boutId: string,
  actorUserId: string,
  input: {
    targetPlayerId: string;
    score?: number;
    isDisqualification: boolean;
    clientOperationId: string;
    phase?: "KATA" | "BUNKAI";
  },
) {
  const bout = await loadBoutForKata(boutId);
  assertBoutHasTwoParticipants(bout);
  const { redId, blueId, isTeam } = resolveBoutSides(bout);
  if (bout.status !== "IN_PROGRESS" && bout.status !== "PAUSED") {
    throw new ConflictError(`This bout is ${bout.status} and cannot record judge evaluations.`);
  }
  const assignment = await resolveOfficialAssignment(bout, actorUserId, ["JUDGE"]);

  if (input.targetPlayerId !== redId && input.targetPlayerId !== blueId) {
    throw new ValidationError("A judge evaluation must target one of this bout's two participants.");
  }
  const performance = await ensureKataPerformance(boutId);
  const phase = input.phase ?? "KATA";
  if (phase === "BUNKAI" && !performance.bunkaiRequired) {
    throw new ValidationError("This performance does not require a Bunkai evaluation (Art. 3.5.4).");
  }
  const config = await getConfig(bout.round.draw.competition.ruleSetVersionId);
  if (!input.isDisqualification) {
    if (input.score === undefined || !isValidScore(input.score, config)) {
      throw new ValidationError(`Score must be between ${config.scoreMin} and ${config.scoreMax} in ${config.scoreIncrement} steps.`);
    }
  }

  const replay = performance.evaluations.some((e) => e.clientOperationId === input.clientOperationId);
  if (!replay) {
    const existing = activeEvaluations(toRawEvaluations(performance.evaluations)).find(
      (e) => e.officialAssignmentId === assignment.id && e.targetPlayerId === input.targetPlayerId && e.phase === phase,
    );
    if (existing) {
      throw new ConflictError("You have already evaluated this athlete for this performance — use the correction endpoint.");
    }
  }

  try {
    await prisma.judgeEvaluation.create({
      data: {
        kataPerformanceId: performance.id,
        officialAssignmentId: assignment.id,
        targetPlayerId: isTeam ? null : input.targetPlayerId,
        targetTeamId: isTeam ? input.targetPlayerId : null,
        phase,
        score: input.isDisqualification ? null : input.score,
        isDisqualification: input.isDisqualification,
        clientOperationId: input.clientOperationId,
      },
    });
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error;
  }
  await recordAudit(actorUserId, "KATA_JUDGE_EVALUATION_SUBMITTED", "Bout", boutId, {
    targetPlayerId: input.targetPlayerId,
    phase,
  });
  const state = await getKataState(boutId, actorUserId);
  emitCompetitionEvent({ eventType: "KATA_STATE_UPDATED", entityType: "Bout", entityId: boutId, tournamentId: bout.round.draw.competition.tournamentId, payload: { state }, actorUserId });
  return state;
}

export async function correctJudgeEvaluation(
  boutId: string,
  actorUserId: string,
  input: { evaluationId: string; score?: number; isDisqualification: boolean; clientOperationId: string },
) {
  const bout = await loadBoutForKata(boutId);
  assertBoutHasTwoParticipants(bout);
  const assignment = await resolveOfficialAssignment(bout, actorUserId, ["JUDGE"]);

  const performance = await ensureKataPerformance(boutId);
  const original = performance.evaluations.find((e) => e.id === input.evaluationId);
  if (!original) {
    throw new NotFoundError("Judge evaluation", input.evaluationId);
  }
  if (original.officialAssignmentId !== assignment.id) {
    throw new AuthorizationError("You may only correct your own judging input.");
  }
  const config = await getConfig(bout.round.draw.competition.ruleSetVersionId);
  if (!input.isDisqualification) {
    if (input.score === undefined || !isValidScore(input.score, config)) {
      throw new ValidationError(`Score must be between ${config.scoreMin} and ${config.scoreMax} in ${config.scoreIncrement} steps.`);
    }
  }

  try {
    await prisma.judgeEvaluation.create({
      data: {
        kataPerformanceId: performance.id,
        officialAssignmentId: assignment.id,
        targetPlayerId: original.targetPlayerId,
        targetTeamId: original.targetTeamId,
        phase: original.phase,
        score: input.isDisqualification ? null : input.score,
        isDisqualification: input.isDisqualification,
        correctionOfId: original.id,
        clientOperationId: input.clientOperationId,
      },
    });
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error;
  }
  await recordAudit(actorUserId, "KATA_JUDGE_EVALUATION_CORRECTED", "Bout", boutId, { evaluationId: original.id });
  const state = await getKataState(boutId, actorUserId);
  emitCompetitionEvent({ eventType: "KATA_STATE_UPDATED", entityType: "Bout", entityId: boutId, tournamentId: bout.round.draw.competition.tournamentId, payload: { state }, actorUserId });
  return state;
}

function mapReasonToMethod(reasonCode: string): "DECISION" | "DISQUALIFICATION" | "NO_SHOW" {
  if (reasonCode === "DISQUALIFICATION") return "DISQUALIFICATION";
  if (reasonCode === "KIKEN") return "NO_SHOW";
  return "DECISION";
}

/** Organizer or Tatami Manager (the Kata "Chief Judge" equivalent, Art. 4.2) — reuses the generic Bout finalization path, never a second result mechanism. */
export async function finalizeKataResult(boutId: string, actorUserId: string, input: { kikenAgainstPlayerId?: string }) {
  const bout = await loadBoutForKata(boutId);
  assertBoutHasTwoParticipants(bout);
  const { redId, blueId, isTeam } = resolveBoutSides(bout);
  const tournament = await getTournamentWithOrganizer(bout.round.draw.competition.tournamentId);
  try {
    await assertUserCanManageTournament(tournament, actorUserId);
  } catch {
    await resolveOfficialAssignment(bout, actorUserId, ["TATAMI_MANAGER"]);
  }

  if (input.kikenAgainstPlayerId && input.kikenAgainstPlayerId !== redId && input.kikenAgainstPlayerId !== blueId) {
    throw new ValidationError("kikenAgainstPlayerId must be one of this bout's two participants.");
  }

  const performance = await ensureKataPerformance(boutId);
  const config = await getConfig(bout.round.draw.competition.ruleSetVersionId);
  let rawEvaluations = toRawEvaluations(performance.evaluations);
  if (performance.bunkaiRequired) {
    rawEvaluations = mergeKataAndBunkaiEvaluations(rawEvaluations);
  }
  const votes = computeJudgeVotes(rawEvaluations, redId, blueId);

  const decision = computeWinner(
    {
      votes,
      redPlayerId: redId,
      bluePlayerId: blueId,
      kikenAgainstPlayerId: input.kikenAgainstPlayerId,
      evaluations: rawEvaluations,
    },
    config,
  );

  if (decision.winnerPlayerId === null) {
    throw new ConflictError(
      "This performance is tied with no rule-defined same-bout tiebreak — resolve via an authorized extra-Kata performance (Art. 5.11) before finalizing.",
    );
  }

  const result = await applyBoutResult(boutId, {
    method: mapReasonToMethod(decision.reasonCode),
    winnerPlayerId: isTeam ? undefined : decision.winnerPlayerId,
    winnerTeamId: isTeam ? decision.winnerPlayerId : undefined,
    finalScoreRed: decision.redVotes,
    finalScoreBlue: decision.blueVotes,
    reason: decision.reasonCode,
  });
  await prisma.boutResult.update({ where: { boutId }, data: { isFinal: true, confirmedByUserId: actorUserId } });
  await processFinalizedResult(boutId, actorUserId);
  emitCompetitionEvent({ eventType: "RESULT_FINALIZED", entityType: "Bout", entityId: boutId, tournamentId: bout.round.draw.competition.tournamentId, payload: { result }, actorUserId });
  await recordAudit(actorUserId, "KATA_RESULT_FINALIZED", "Bout", boutId, {
    reasonCode: decision.reasonCode,
    winnerPlayerId: decision.winnerPlayerId,
  });
  return { ...result, result: result.result ? { ...result.result, isFinal: true } : result.result };
}

/**
 * Art. 5.11 — round-robin GROUP STANDINGS for one Draw (the existing "group"
 * primitive; see kataStandings.ts). Purely derived from already-finalized
 * Bout results — never recomputes a bout's own winner, and is naturally
 * "protected" from mutation because it has no stored state of its own: it
 * always replays the current finalized history.
 */
export async function getRoundRobinStandings(drawId: string) {
  const draw = await prisma.draw.findUnique({
    where: { id: drawId },
    include: {
      seeds: { select: { playerId: true } },
      competition: { select: { discipline: true } },
      rounds: {
        include: {
          bouts: {
            include: { result: true },
          },
        },
      },
    },
  });
  if (!draw) {
    throw new NotFoundError("Draw", drawId);
  }
  if (draw.competition.discipline !== "KATA") {
    throw new ValidationError("Standings are only computed for Kata competitions.");
  }
  if (draw.bracketType !== "ROUND_ROBIN") {
    throw new ValidationError("Standings only apply to a ROUND_ROBIN draw.");
  }

  const playerIds = [...new Set(draw.seeds.map((s) => s.playerId))];
  const results: StandingBoutResult[] = [];
  for (const round of draw.rounds) {
    for (const bout of round.bouts) {
      const isFinished = bout.status === "FINISHED" || bout.status === "FINALIZED";
      if (!isFinished || !bout.result || !bout.result.winnerPlayerId) continue;
      if (!bout.redPlayerId || !bout.bluePlayerId) continue;
      results.push({
        redPlayerId: bout.redPlayerId,
        bluePlayerId: bout.bluePlayerId,
        winnerPlayerId: bout.result.winnerPlayerId,
        redVotes: bout.result.finalScoreRed ?? 0,
        blueVotes: bout.result.finalScoreBlue ?? 0,
      });
    }
  }

  return { drawId, standings: computeRoundRobinStandings(playerIds, results) };
}

// ============================================================================
// TEAM KATA (Art. 3.5)
// ============================================================================

const MIN_TEAM_MEMBERS = 3;
const MAX_TEAM_MEMBERS = 4;

async function assertActorAdministersAcademy(academyId: string, actorUserId: string) {
  const membership = await prisma.academyAdministrator.findUnique({
    where: { academyId_userId: { academyId, userId: actorUserId } },
  });
  if (!membership) {
    throw new AuthorizationError("You do not administer this academy.");
  }
}

/** Organizer-facing team roster. Reuses the same "who administers this academy" boundary as the rest of the platform (AcademyAdministrator) — never a client-asserted academyId/team membership. */
export async function createKataTeam(actorUserId: string, input: { academyId: string; competitionId: string; name: string }) {
  await assertActorAdministersAcademy(input.academyId, actorUserId);
  const competition = await prisma.competition.findUnique({ where: { id: input.competitionId } });
  if (!competition || competition.discipline !== "KATA") {
    throw new ValidationError("competitionId must reference a Kata competition.");
  }
  const team = await prisma.kataTeam.create({
    data: { academyId: input.academyId, competitionId: input.competitionId, name: input.name, createdByUserId: actorUserId },
  });
  await recordAudit(actorUserId, "KATA_TEAM_CREATED", "KataTeam", team.id, { academyId: input.academyId, competitionId: input.competitionId });
  return team;
}

export async function addKataTeamMember(actorUserId: string, teamId: string, playerId: string) {
  const team = await prisma.kataTeam.findUnique({ where: { id: teamId }, include: { members: { where: { status: "ACTIVE" } } } });
  if (!team) throw new NotFoundError("KataTeam", teamId);
  await assertActorAdministersAcademy(team.academyId, actorUserId);

  if (team.members.length >= MAX_TEAM_MEMBERS) {
    throw new ConflictError(`A Kata Team may have at most ${MAX_TEAM_MEMBERS} Athletes (Art. 3.5.1).`);
  }
  // The athlete's identity is looked up server-side and must be an ACTIVE member of this same academy — never trusted from the client beyond the id itself.
  const membership = await prisma.academyPlayerMembership.findFirst({
    where: { academyId: team.academyId, playerId, status: "ACTIVE" },
  });
  if (!membership) {
    throw new ValidationError("This Athlete is not an ACTIVE member of the team's academy.");
  }

  try {
    const member = await prisma.kataTeamMember.create({ data: { teamId, playerId } });
    await recordAudit(actorUserId, "KATA_TEAM_MEMBER_ADDED", "KataTeam", teamId, { playerId });
    return member;
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new ConflictError("This Athlete is already a member of this Team.");
    }
    throw error;
  }
}

export async function removeKataTeamMember(actorUserId: string, teamId: string, playerId: string) {
  const team = await prisma.kataTeam.findUnique({ where: { id: teamId } });
  if (!team) throw new NotFoundError("KataTeam", teamId);
  await assertActorAdministersAcademy(team.academyId, actorUserId);

  const member = await prisma.kataTeamMember.findUnique({ where: { teamId_playerId: { teamId, playerId } } });
  if (!member || member.status !== "ACTIVE") {
    throw new NotFoundError("Active KataTeamMember", playerId);
  }
  await prisma.kataTeamMember.update({ where: { id: member.id }, data: { status: "REMOVED" } });
  await recordAudit(actorUserId, "KATA_TEAM_MEMBER_REMOVED", "KataTeam", teamId, { playerId });
  return { removed: true };
}

export async function listKataTeams(competitionId: string) {
  return prisma.kataTeam.findMany({
    where: { competitionId },
    include: { members: { where: { status: "ACTIVE" }, include: { player: { select: { id: true, displayName: true } } } } },
    orderBy: { name: "asc" },
  });
}

/**
 * Manually creates a Team-vs-Team Bout (Art. 3.5) inside a dedicated "manual"
 * Draw for this competition. Team Kata pairing/bracket automation is not
 * implemented this phase — the organizer explicitly names both Teams — but
 * the resulting Bout/Round/Draw rows are the exact same tables the
 * individual bracket engine produces, so every downstream Kata/audit/result
 * mechanism works identically.
 */
export async function createTeamBout(
  actorUserId: string,
  input: { competitionId: string; redTeamId: string; blueTeamId: string; bunkaiRequired: boolean },
) {
  const competition = await prisma.competition.findUnique({ where: { id: input.competitionId } });
  if (!competition || competition.discipline !== "KATA") {
    throw new ValidationError("competitionId must reference a Kata competition.");
  }
  const tournament = await getTournamentWithOrganizer(competition.tournamentId);
  await assertUserCanManageTournament(tournament, actorUserId);

  if (input.redTeamId === input.blueTeamId) {
    throw new ValidationError("A Team cannot face itself.");
  }
  const teams = await prisma.kataTeam.findMany({
    where: { id: { in: [input.redTeamId, input.blueTeamId] }, competitionId: input.competitionId, status: "ACTIVE" },
    include: { members: { where: { status: "ACTIVE" } } },
  });
  if (teams.length !== 2) {
    throw new ValidationError("Both Teams must be ACTIVE Teams registered for this competition.");
  }
  if (teams.some((t) => t.members.length < MIN_TEAM_MEMBERS)) {
    throw new ValidationError(`Both Teams must have at least ${MIN_TEAM_MEMBERS} ACTIVE Athletes (Art. 3.5.1).`);
  }

  return prisma.$transaction(async (tx) => {
    let draw = await tx.draw.findFirst({ where: { competitionId: input.competitionId, bracketType: "ROUND_ROBIN", isActive: true, seedingStrategy: "MANUAL" } });
    if (!draw) {
      draw = await tx.draw.create({
        data: {
          competitionId: input.competitionId,
          version: 1,
          bracketType: "ROUND_ROBIN",
          status: "LOCKED",
          seedingStrategy: "MANUAL",
          generatedByUserId: actorUserId,
        },
      });
    }
    const roundCount = await tx.round.count({ where: { drawId: draw.id } });
    const round = await tx.round.create({
      data: { drawId: draw.id, roundNumber: roundCount + 1, name: `Team match ${roundCount + 1}` },
    });
    const bout = await tx.bout.create({
      data: { roundId: round.id, sequenceNumber: 1, redTeamId: input.redTeamId, blueTeamId: input.blueTeamId },
    });
    if (input.bunkaiRequired) {
      await tx.kataPerformance.create({ data: { boutId: bout.id, bunkaiRequired: true } });
    }
    await recordAudit(actorUserId, "KATA_TEAM_BOUT_CREATED", "Bout", bout.id, {
      redTeamId: input.redTeamId,
      blueTeamId: input.blueTeamId,
    });
    return bout;
  });
}
