import type { KataResultReason } from "@karate/types";

/**
 * Pure, deterministic Kata rule engine — driven by the verified WKF Kata
 * Competition Rules, Version 2026.0, valid from 1 January 2026
 * (https://www.wkf.net/files/pdf/documents/WKF%20Kata%20Competition%20Rules%202026%20MASTER%20COPY_V2.pdf,
 * retrieved 2026-09-17). Article references below cite that document.
 *
 * No I/O here — apps/api/src/modules/kata reads/writes JudgeEvaluation rows
 * and calls into these functions, so the result stays reproducible from
 * (evaluations + config) alone.
 */

export interface KataConfig {
  scoreMin: number;
  scoreMax: number;
  scoreIncrement: number;
  kikenVotes: number;
}

export function isValidScore(score: number, config: KataConfig): boolean {
  if (score < config.scoreMin || score > config.scoreMax) return false;
  const steps = (score - config.scoreMin) / config.scoreIncrement;
  return Math.abs(steps - Math.round(steps)) < 1e-6;
}

export interface RawJudgeEvaluation {
  id: string;
  officialAssignmentId: string;
  targetPlayerId: string;
  /** Art. 3.5.4/5.4.3 — a Team medal performance is judged in two phases; each is corrected/deduped independently. */
  phase: "KATA" | "BUNKAI";
  score: number | null;
  isDisqualification: boolean;
  correctionOfId: string | null;
  sequence: number;
}

/** Only the latest evaluation per (official, athlete, phase) counts — a correction never deletes the original, but supersedes it for scoring purposes (Art. "original judge input must never be silently overwritten"). */
export function activeEvaluations(evaluations: RawJudgeEvaluation[]): RawJudgeEvaluation[] {
  const superseded = new Set(evaluations.filter((e) => e.correctionOfId).map((e) => e.correctionOfId));
  const latestByKey = new Map<string, RawJudgeEvaluation>();
  for (const e of [...evaluations].sort((a, b) => a.sequence - b.sequence)) {
    if (superseded.has(e.id)) continue;
    latestByKey.set(`${e.officialAssignmentId}:${e.targetPlayerId}:${e.phase}`, e);
  }
  return [...latestByKey.values()];
}

export interface JudgeVote {
  officialAssignmentId: string;
  votedForPlayerId: string | null; // null when the judge has not evaluated both sides yet, or both are disqualified
}

/**
 * Art. 5.4.2 — "The winner is pointed out by each judge based on the
 * relative marks that particular judge gave for each of the two Athletes."
 * A judge who scored both sides votes for whichever they scored higher (a
 * disqualified [isDisqualification/0.0] side always loses to a real score).
 */
export function computeJudgeVotes(
  evaluations: RawJudgeEvaluation[],
  redPlayerId: string,
  bluePlayerId: string,
): JudgeVote[] {
  const active = activeEvaluations(evaluations);
  const officialIds = [...new Set(active.map((e) => e.officialAssignmentId))];
  const votes: JudgeVote[] = [];

  for (const officialAssignmentId of officialIds) {
    const redEval = active.find((e) => e.officialAssignmentId === officialAssignmentId && e.targetPlayerId === redPlayerId);
    const blueEval = active.find((e) => e.officialAssignmentId === officialAssignmentId && e.targetPlayerId === bluePlayerId);
    if (!redEval || !blueEval) {
      votes.push({ officialAssignmentId, votedForPlayerId: null });
      continue;
    }
    const redScore = redEval.isDisqualification ? 0 : (redEval.score ?? 0);
    const blueScore = blueEval.isDisqualification ? 0 : (blueEval.score ?? 0);
    if (redScore === blueScore) {
      votes.push({ officialAssignmentId, votedForPlayerId: null });
    } else {
      votes.push({ officialAssignmentId, votedForPlayerId: redScore > blueScore ? redPlayerId : bluePlayerId });
    }
  }
  return votes;
}

export interface WinnerInput {
  votes: JudgeVote[];
  redPlayerId: string;
  bluePlayerId: string;
  /** Set only for a KIKEN (failure to appear) — no judge evaluations exist because the bout never happened. */
  kikenAgainstPlayerId?: string;
  evaluations?: RawJudgeEvaluation[];
}

export interface WinnerDecision {
  winnerPlayerId: string | null;
  reasonCode: KataResultReason;
  redVotes: number;
  blueVotes: number;
}

/**
 * Art. 5.5.1/5.10.1 — winner is decided by majority of judge votes. Art.
 * 5.11 (last line): "In the case of Kiken, the winning Athlete/Team will be
 * awarded 4 votes for the bout" — a fixed vote count, not computed from
 * evaluations, because there is nothing to judge.
 *
 * The verified rules define tie-break procedures only for Round-robin GROUP
 * STANDINGS (Art. 5.11-5.13), never for a single one-on-one bout — with an
 * odd judging panel (5 or 7, Art. 4.1) a real majority always exists unless
 * a judge abstains (didn't evaluate both sides) or scores tie. Rather than
 * inventing an unsupported same-bout tiebreak, an even split is reported as
 * TIE_UNRESOLVED and must be resolved by an authorized official action
 * (e.g. Art. 5.11 item 5's "extra kata" performed and re-judged), never
 * auto-decided by this engine.
 */
export function computeWinner(input: WinnerInput, config: KataConfig): WinnerDecision {
  const { votes, redPlayerId, bluePlayerId, kikenAgainstPlayerId, evaluations } = input;

  if (kikenAgainstPlayerId) {
    const winnerPlayerId = kikenAgainstPlayerId === redPlayerId ? bluePlayerId : redPlayerId;
    return {
      winnerPlayerId,
      reasonCode: "KIKEN",
      redVotes: winnerPlayerId === redPlayerId ? config.kikenVotes : 0,
      blueVotes: winnerPlayerId === bluePlayerId ? config.kikenVotes : 0,
    };
  }

  const redVotes = votes.filter((v) => v.votedForPlayerId === redPlayerId).length;
  const blueVotes = votes.filter((v) => v.votedForPlayerId === bluePlayerId).length;

  if (redVotes === blueVotes) {
    return { winnerPlayerId: null, reasonCode: "TIE_UNRESOLVED", redVotes, blueVotes };
  }

  const winnerPlayerId = redVotes > blueVotes ? redPlayerId : bluePlayerId;
  const loserPlayerId = winnerPlayerId === redPlayerId ? bluePlayerId : redPlayerId;

  let reasonCode: KataResultReason = "JUDGE_MAJORITY";
  if (evaluations) {
    const active = activeEvaluations(evaluations).filter((e) => e.targetPlayerId === loserPlayerId);
    if (active.length > 0 && active.every((e) => e.isDisqualification)) {
      reasonCode = "DISQUALIFICATION";
    }
  }

  return { winnerPlayerId, reasonCode, redVotes, blueVotes };
}

/**
 * Art. 3.5.4/5.4.3 — Team medal matches add a Bunkai demonstration performed
 * as part of the same performance, "given equal importance as the Kata
 * itself." Rather than a second scoring engine, this combines each judge's
 * KATA-phase and BUNKAI-phase evaluations for a target into one synthetic
 * evaluation (summed score, disqualified if either phase is) so the
 * existing computeJudgeVotes/computeWinner run completely unmodified.
 */
export function mergeKataAndBunkaiEvaluations(evaluations: RawJudgeEvaluation[]): RawJudgeEvaluation[] {
  const active = activeEvaluations(evaluations);
  const byKey = new Map<string, RawJudgeEvaluation[]>();
  for (const e of active) {
    const key = `${e.officialAssignmentId}:${e.targetPlayerId}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key)!.push(e);
  }
  const merged: RawJudgeEvaluation[] = [];
  for (const [, group] of byKey) {
    if (group.length === 1) {
      merged.push(group[0]!);
      continue;
    }
    const isDisqualification = group.some((e) => e.isDisqualification);
    const score = isDisqualification ? null : group.reduce((sum, e) => sum + (e.score ?? 0), 0);
    const latest = group.reduce((a, b) => (b.sequence > a.sequence ? b : a));
    merged.push({ ...latest, score, isDisqualification });
  }
  return merged;
}

/** Art. 5.2.1 — a Kata cannot be performed twice in a row, nor more than twice total by the same Athlete/Team across the competition. */
export function isKataRepetitionAllowed(
  priorKataDefinitionIds: string[],
  candidateKataDefinitionId: string,
  config: { maxKataRepeats: number },
): boolean {
  if (priorKataDefinitionIds.length > 0 && priorKataDefinitionIds[priorKataDefinitionIds.length - 1] === candidateKataDefinitionId) {
    return false;
  }
  const priorCount = priorKataDefinitionIds.filter((id) => id === candidateKataDefinitionId).length;
  return priorCount < config.maxKataRepeats;
}
