import { describe, it, expect } from "vitest";
import {
  isValidScore,
  activeEvaluations,
  computeJudgeVotes,
  computeWinner,
  isKataRepetitionAllowed,
  mergeKataAndBunkaiEvaluations,
  type RawJudgeEvaluation,
  type KataConfig,
} from "../src/domain/kataEngine";

const CONFIG: KataConfig = { scoreMin: 5.0, scoreMax: 10.0, scoreIncrement: 0.1, kikenVotes: 4 };
const RED = "red-player";
const BLUE = "blue-player";

function ev(
  id: string,
  officialAssignmentId: string,
  targetPlayerId: string,
  score: number | null,
  sequence: number,
  opts: { isDisqualification?: boolean; correctionOfId?: string | null; phase?: "KATA" | "BUNKAI" } = {},
): RawJudgeEvaluation {
  return {
    id,
    officialAssignmentId,
    targetPlayerId,
    phase: opts.phase ?? "KATA",
    score,
    isDisqualification: opts.isDisqualification ?? false,
    correctionOfId: opts.correctionOfId ?? null,
    sequence,
  };
}

describe("Score validation (Art. 5.4.1)", () => {
  it("accepts 5.0 to 10.0 in 0.1 steps", () => {
    expect(isValidScore(5.0, CONFIG)).toBe(true);
    expect(isValidScore(7.3, CONFIG)).toBe(true);
    expect(isValidScore(10.0, CONFIG)).toBe(true);
  });
  it("rejects out-of-range or off-increment scores", () => {
    expect(isValidScore(4.9, CONFIG)).toBe(false);
    expect(isValidScore(10.1, CONFIG)).toBe(false);
    expect(isValidScore(7.35, CONFIG)).toBe(false);
  });
});

describe("Correction history (original never overwritten)", () => {
  it("22/23. a correction supersedes the original for scoring, but the original row is untouched", () => {
    const original = ev("1", "j1", RED, 8.0, 0);
    const correction = ev("2", "j1", RED, 8.5, 1, { correctionOfId: "1" });
    const active = activeEvaluations([original, correction]);
    expect(active).toHaveLength(1);
    expect(active[0]!.score).toBe(8.5);
    // the original object itself is never mutated
    expect(original.score).toBe(8.0);
  });
});

describe("Judge votes (Art. 5.4.2)", () => {
  it("a judge votes for whichever athlete they scored higher", () => {
    const evaluations = [ev("1", "j1", RED, 8.5, 0), ev("2", "j1", BLUE, 7.9, 1)];
    const votes = computeJudgeVotes(evaluations, RED, BLUE);
    expect(votes).toEqual([{ officialAssignmentId: "j1", votedForPlayerId: RED }]);
  });

  it("10. multiple judges are stored and voted independently", () => {
    const evaluations = [
      ev("1", "j1", RED, 8.5, 0),
      ev("2", "j1", BLUE, 7.9, 1),
      ev("3", "j2", RED, 7.0, 2),
      ev("4", "j2", BLUE, 8.2, 3),
    ];
    const votes = computeJudgeVotes(evaluations, RED, BLUE);
    expect(votes).toEqual(
      expect.arrayContaining([
        { officialAssignmentId: "j1", votedForPlayerId: RED },
        { officialAssignmentId: "j2", votedForPlayerId: BLUE },
      ]),
    );
  });

  it("a disqualified athlete (0.0) always loses the vote to a real score", () => {
    const evaluations = [ev("1", "j1", RED, null, 0, { isDisqualification: true }), ev("2", "j1", BLUE, 6.0, 1)];
    const votes = computeJudgeVotes(evaluations, RED, BLUE);
    expect(votes).toEqual([{ officialAssignmentId: "j1", votedForPlayerId: BLUE }]);
  });

  it("a judge who has not yet evaluated both sides casts no vote", () => {
    const votes = computeJudgeVotes([ev("1", "j1", RED, 8.0, 0)], RED, BLUE);
    expect(votes).toEqual([{ officialAssignmentId: "j1", votedForPlayerId: null }]);
  });
});

describe("Winner calculation (Art. 5.5.1/5.10.1)", () => {
  it("11. the athlete with the majority of votes wins", () => {
    const votes = [
      { officialAssignmentId: "j1", votedForPlayerId: RED },
      { officialAssignmentId: "j2", votedForPlayerId: RED },
      { officialAssignmentId: "j3", votedForPlayerId: BLUE },
    ];
    const decision = computeWinner({ votes, redPlayerId: RED, bluePlayerId: BLUE }, CONFIG);
    expect(decision).toEqual({ winnerPlayerId: RED, reasonCode: "JUDGE_MAJORITY", redVotes: 2, blueVotes: 1 });
  });

  it("12. an even split with no rule-defined same-bout tiebreak is reported, not auto-resolved", () => {
    const votes = [
      { officialAssignmentId: "j1", votedForPlayerId: RED },
      { officialAssignmentId: "j2", votedForPlayerId: BLUE },
    ];
    const decision = computeWinner({ votes, redPlayerId: RED, bluePlayerId: BLUE }, CONFIG);
    expect(decision.winnerPlayerId).toBeNull();
    expect(decision.reasonCode).toBe("TIE_UNRESOLVED");
  });

  it("13. a majority against an all-disqualified loser is reported as DISQUALIFICATION", () => {
    const evaluations = [
      ev("1", "j1", RED, null, 0, { isDisqualification: true }),
      ev("2", "j1", BLUE, 7.0, 1),
      ev("3", "j2", RED, null, 2, { isDisqualification: true }),
      ev("4", "j2", BLUE, 6.5, 3),
    ];
    const votes = computeJudgeVotes(evaluations, RED, BLUE);
    const decision = computeWinner({ votes, redPlayerId: RED, bluePlayerId: BLUE, evaluations }, CONFIG);
    expect(decision).toEqual({ winnerPlayerId: BLUE, reasonCode: "DISQUALIFICATION", redVotes: 0, blueVotes: 2 });
  });

  it("KIKEN awards the fixed configured vote count to the opponent, not a computed tally", () => {
    const decision = computeWinner({ votes: [], redPlayerId: RED, bluePlayerId: BLUE, kikenAgainstPlayerId: RED }, CONFIG);
    expect(decision).toEqual({ winnerPlayerId: BLUE, reasonCode: "KIKEN", redVotes: 0, blueVotes: 4 });
  });

  it("24. result reproducibility: identical inputs always produce identical decisions", () => {
    const evaluations = [ev("1", "j1", RED, 8.0, 0), ev("2", "j1", BLUE, 7.5, 1)];
    const votes1 = computeJudgeVotes(evaluations, RED, BLUE);
    const votes2 = computeJudgeVotes([...evaluations].reverse(), RED, BLUE);
    const d1 = computeWinner({ votes: votes1, redPlayerId: RED, bluePlayerId: BLUE, evaluations }, CONFIG);
    const d2 = computeWinner({ votes: votes2, redPlayerId: RED, bluePlayerId: BLUE, evaluations }, CONFIG);
    expect(d1).toEqual(d2);
  });
});

describe("Kata repetition (Art. 5.2.1)", () => {
  const cfg = { maxKataRepeats: 2 };
  it("blocks the same Kata performed twice in a row", () => {
    expect(isKataRepetitionAllowed(["heian-shodan"], "heian-shodan", cfg)).toBe(false);
  });
  it("allows a different Kata immediately after", () => {
    expect(isKataRepetitionAllowed(["heian-shodan"], "bassai-dai", cfg)).toBe(true);
  });
  it("blocks a Kata performed a third time", () => {
    expect(isKataRepetitionAllowed(["heian-shodan", "bassai-dai", "heian-shodan"], "heian-shodan", cfg)).toBe(false);
  });
  it("allows a Kata performed only once before (not consecutively)", () => {
    expect(isKataRepetitionAllowed(["heian-shodan", "bassai-dai"], "heian-shodan", cfg)).toBe(true);
  });
});

describe("Bunkai merge for Team medal matches (Art. 3.5.4/5.4.3)", () => {
  it("17. sums a judge's KATA and BUNKAI scores for the same target into one evaluation, equal importance", () => {
    const evaluations: RawJudgeEvaluation[] = [
      { id: "1", officialAssignmentId: "j1", targetPlayerId: "teamA", phase: "KATA", score: 8.0, isDisqualification: false, correctionOfId: null, sequence: 0 },
      { id: "2", officialAssignmentId: "j1", targetPlayerId: "teamA", phase: "BUNKAI", score: 7.5, isDisqualification: false, correctionOfId: null, sequence: 1 },
    ];
    const merged = mergeKataAndBunkaiEvaluations(evaluations);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.score).toBe(15.5);
  });

  it("a disqualification in either phase disqualifies the merged evaluation", () => {
    const evaluations: RawJudgeEvaluation[] = [
      { id: "1", officialAssignmentId: "j1", targetPlayerId: "teamA", phase: "KATA", score: 8.0, isDisqualification: false, correctionOfId: null, sequence: 0 },
      { id: "2", officialAssignmentId: "j1", targetPlayerId: "teamA", phase: "BUNKAI", score: null, isDisqualification: true, correctionOfId: null, sequence: 1 },
    ];
    const merged = mergeKataAndBunkaiEvaluations(evaluations);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.isDisqualification).toBe(true);
    expect(merged[0]!.score).toBeNull();
  });

  it("18. team result calculation: merged Kata+Bunkai evaluations feed the same vote-majority engine unmodified", () => {
    const evaluations: RawJudgeEvaluation[] = [
      { id: "1", officialAssignmentId: "j1", targetPlayerId: "teamA", phase: "KATA", score: 8.0, isDisqualification: false, correctionOfId: null, sequence: 0 },
      { id: "2", officialAssignmentId: "j1", targetPlayerId: "teamA", phase: "BUNKAI", score: 8.0, isDisqualification: false, correctionOfId: null, sequence: 1 },
      { id: "3", officialAssignmentId: "j1", targetPlayerId: "teamB", phase: "KATA", score: 7.0, isDisqualification: false, correctionOfId: null, sequence: 2 },
      { id: "4", officialAssignmentId: "j1", targetPlayerId: "teamB", phase: "BUNKAI", score: 7.0, isDisqualification: false, correctionOfId: null, sequence: 3 },
    ];
    const merged = mergeKataAndBunkaiEvaluations(evaluations);
    const votes = computeJudgeVotes(merged, "teamA", "teamB");
    expect(votes).toEqual([{ officialAssignmentId: "j1", votedForPlayerId: "teamA" }]);
  });

  it("a correction to only the BUNKAI phase does not affect the KATA phase's evaluation", () => {
    const evaluations: RawJudgeEvaluation[] = [
      { id: "1", officialAssignmentId: "j1", targetPlayerId: "teamA", phase: "KATA", score: 8.0, isDisqualification: false, correctionOfId: null, sequence: 0 },
      { id: "2", officialAssignmentId: "j1", targetPlayerId: "teamA", phase: "BUNKAI", score: 7.0, isDisqualification: false, correctionOfId: null, sequence: 1 },
      { id: "3", officialAssignmentId: "j1", targetPlayerId: "teamA", phase: "BUNKAI", score: 7.5, isDisqualification: false, correctionOfId: "2", sequence: 2 },
    ];
    const merged = mergeKataAndBunkaiEvaluations(evaluations);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.score).toBe(15.5); // 8.0 (KATA) + 7.5 (corrected BUNKAI), not the superseded 7.0.
  });
});
