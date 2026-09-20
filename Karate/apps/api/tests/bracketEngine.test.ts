import { describe, it, expect } from "vitest";
import {
  computeSeedPositions,
  assignSingleEliminationSlots,
  generateSingleEliminationRounds,
  generateRoundRobinRounds,
  type DrawEntrant,
} from "../src/domain/bracketEngine";

function entrant(n: number): DrawEntrant {
  return { registrationId: `reg-${n}`, playerId: `player-${n}` };
}

describe("Bracket engine (Phase 10)", () => {
  it("computes the canonical seed order for standard bracket sizes", () => {
    expect(computeSeedPositions(2)).toEqual([1, 2]);
    expect(computeSeedPositions(4)).toEqual([1, 4, 2, 3]);
    expect(computeSeedPositions(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
  });

  it("assigns byes explicitly (never a fake player) for a non-power-of-two field", () => {
    const entrants = [1, 2, 3, 4, 5].map(entrant);
    const { bracketSize, slots } = assignSingleEliminationSlots(entrants, "NONE");
    expect(bracketSize).toBe(8);
    const byeCount = slots.filter((s) => s === null).length;
    expect(byeCount).toBe(3);
    // every real entrant appears exactly once
    const playerIds = slots.filter((s): s is NonNullable<typeof s> => s !== null).map((s) => s.playerId);
    expect(new Set(playerIds).size).toBe(5);
  });

  it("records seed numbers only when the seed source implies one", () => {
    const entrants = [1, 2, 3, 4].map(entrant);
    const manual = assignSingleEliminationSlots(entrants, "MANUAL");
    expect(manual.slots.every((s) => s?.seedNumber != null)).toBe(true);
    const random = assignSingleEliminationSlots(entrants, "RANDOM");
    expect(random.slots.every((s) => s?.seedNumber == null)).toBe(true);
  });

  it("a bye auto-advances the sole real player into round 2", () => {
    const entrants = [1, 2, 3, 4, 5].map(entrant);
    const { slots } = assignSingleEliminationSlots(entrants, "NONE");
    const rounds = generateSingleEliminationRounds(slots);
    expect(rounds).toHaveLength(3); // 8-slot bracket -> 3 rounds
    expect(rounds[0]!.bouts).toHaveLength(4);
    const byeBouts = rounds[0]!.bouts.filter((b) => b.redPlayerId === null || b.bluePlayerId === null);
    expect(byeBouts).toHaveLength(3);
    // Round 2 must already have the auto-advanced bye winners seeded in, not left entirely TBD.
    const round2Filled = rounds[1]!.bouts.flatMap((b) => [b.redPlayerId, b.bluePlayerId]).filter(Boolean);
    expect(round2Filled.length).toBeGreaterThan(0);
  });

  it("a real (non-bye) round-1 matchup leaves round 2 undecided (TBD), not fabricated", () => {
    const entrants = [1, 2, 3, 4, 5, 6, 7, 8].map(entrant); // full bracket, no byes
    const { slots } = assignSingleEliminationSlots(entrants, "NONE");
    const rounds = generateSingleEliminationRounds(slots);
    expect(rounds[1]!.bouts.every((b) => b.redPlayerId === null && b.bluePlayerId === null)).toBe(true);
  });

  it("round robin: every player faces every other player exactly once", () => {
    const entrants = [1, 2, 3, 4].map(entrant);
    const rounds = generateRoundRobinRounds(entrants);
    expect(rounds).toHaveLength(3);
    const pairs = new Set<string>();
    for (const round of rounds) {
      for (const bout of round.bouts) {
        const key = [bout.redPlayerId, bout.bluePlayerId].sort().join("|");
        expect(pairs.has(key)).toBe(false);
        pairs.add(key);
      }
    }
    expect(pairs.size).toBe(6); // C(4,2)
  });

  it("round robin: an odd field gets an explicit rest round for one player per round, no phantom bout", () => {
    const entrants = [1, 2, 3, 4, 5].map(entrant);
    const rounds = generateRoundRobinRounds(entrants);
    expect(rounds).toHaveLength(5);
    for (const round of rounds) {
      expect(round.bouts).toHaveLength(2); // one player rests each round
    }
  });
});
