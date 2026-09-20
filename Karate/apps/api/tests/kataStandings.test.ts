import { describe, it, expect } from "vitest";
import { computeRoundRobinStandings, type StandingBoutResult } from "../src/domain/kataStandings";

const A = "a";
const B = "b";
const C = "c";
const D = "d";

function res(red: string, blue: string, winner: string, redVotes: number, blueVotes: number): StandingBoutResult {
  return { redPlayerId: red, bluePlayerId: blue, winnerPlayerId: winner, redVotes, blueVotes };
}

describe("Round-robin group standings (Art. 5.11)", () => {
  it("5/6. group creation and standings calculation by victory points", () => {
    const results = [res(A, B, A, 3, 0), res(A, C, A, 3, 0), res(B, C, C, 1, 2)];
    const standings = computeRoundRobinStandings([A, B, C], results);
    expect(standings.find((s) => s.playerId === A)!.victoryPoints).toBe(6);
    expect(standings.find((s) => s.playerId === C)!.victoryPoints).toBe(3);
    expect(standings.find((s) => s.playerId === B)!.victoryPoints).toBe(0);
    expect(standings[0]!.playerId).toBe(A);
  });

  it("7. a 2-way tie in victory points is resolved by head-to-head", () => {
    // A beat C, B beat C, and A beat B directly -> A and B tied on points, head-to-head resolves A above B.
    const results = [res(A, B, A, 3, 0), res(A, C, C, 1, 2), res(B, C, B, 3, 0)];
    const standings = computeRoundRobinStandings([A, B, C], results);
    const a = standings.find((s) => s.playerId === A)!;
    const b = standings.find((s) => s.playerId === B)!;
    expect(a.victoryPoints).toBe(b.victoryPoints);
    expect(a.rank).toBeLessThan(b.rank);
    expect(a.tieUnresolved).toBe(false);
  });

  it("8. a 3-way tie falls through to sum-of-votes-for when head-to-head cannot generalize", () => {
    // A, B, C each win one and lose one -> all tied on victory points; break by total votes-for.
    const results = [res(A, B, A, 3, 1), res(B, C, B, 3, 1), res(C, A, C, 3, 1)];
    const standings = computeRoundRobinStandings([A, B, C], results);
    // A: votesFor = 3(vs B) + 1(vs C, lost) = 4; B: 1(vs A) + 3(vs C) = 4; C: 1(vs B) + 3(vs A) = 4 -> fully tied, unresolved.
    expect(standings.every((s) => s.victoryPoints === 3)).toBe(true);
    expect(standings.some((s) => s.tieUnresolved)).toBe(true);
  });

  it("a 3-way tie IS resolved when votes-for differ", () => {
    const results = [res(A, B, A, 5, 1), res(B, C, B, 3, 2), res(C, A, C, 1, 4)];
    // A: 5 (vs B) + 4 (vs C, lost) = 9; B: 1 (vs A) + 3 (vs C) = 4; C: 2 (vs B) + 1 (vs A) = 3.
    const standings = computeRoundRobinStandings([A, B, C], results);
    expect(standings.every((s) => s.victoryPoints === 3)).toBe(true);
    expect(standings.every((s) => !s.tieUnresolved)).toBe(true);
    expect(standings[0]!.playerId).toBe(A);
    expect(standings[1]!.playerId).toBe(B);
    expect(standings[2]!.playerId).toBe(C);
  });

  it("9. ordering is deterministic regardless of input result order", () => {
    const results = [res(A, B, A, 3, 0), res(A, C, A, 3, 0), res(B, C, C, 1, 2)];
    const s1 = computeRoundRobinStandings([A, B, C], results);
    const s2 = computeRoundRobinStandings([C, B, A], [...results].reverse());
    expect(s1.map((s) => s.playerId)).toEqual(s2.map((s) => s.playerId));
  });

  it("handles a 4-player group with a clean ranking (no ties)", () => {
    const results = [
      res(A, B, A, 3, 0),
      res(A, C, A, 3, 0),
      res(A, D, A, 3, 0),
      res(B, C, B, 3, 0),
      res(B, D, B, 3, 0),
      res(C, D, C, 3, 0),
    ];
    const standings = computeRoundRobinStandings([A, B, C, D], results);
    expect(standings.map((s) => s.playerId)).toEqual([A, B, C, D]);
    expect(standings.map((s) => s.rank)).toEqual([1, 2, 3, 4]);
  });

  it("10. standings are a pure computation over finalized results — never mutate the inputs", () => {
    const results = [res(A, B, A, 3, 0)];
    const snapshot = JSON.parse(JSON.stringify(results));
    computeRoundRobinStandings([A, B], results);
    expect(results).toEqual(snapshot);
  });
});
