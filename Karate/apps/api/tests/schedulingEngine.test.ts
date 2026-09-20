import { describe, it, expect } from "vitest";
import { generateSchedule, type SchedulableBout } from "../src/domain/schedulingEngine";

const START = new Date("2026-06-01T09:00:00.000Z");

function bout(
  overrides: Partial<SchedulableBout> & Pick<SchedulableBout, "boutId" | "roundNumber">,
): SchedulableBout {
  return {
    competitionId: "comp-1",
    redPlayerId: null,
    bluePlayerId: null,
    isBye: false,
    durationMinutes: 5,
    ...overrides,
  };
}

describe("Scheduling engine (Phase 11)", () => {
  it("never double-books a tatami — sequential bouts on one tatami never overlap", () => {
    const bouts = [
      bout({ boutId: "b1", roundNumber: 1, redPlayerId: "p1", bluePlayerId: "p2" }),
      bout({ boutId: "b2", roundNumber: 1, redPlayerId: "p3", bluePlayerId: "p4" }),
      bout({ boutId: "b3", roundNumber: 1, redPlayerId: "p5", bluePlayerId: "p6" }),
    ];
    const entries = generateSchedule({
      startAt: START,
      tatamiIds: ["t1"],
      boutsByCompetition: new Map([["comp-1", bouts]]),
    });
    expect(entries).toHaveLength(3);
    const sorted = [...entries].sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());
    for (let i = 1; i < sorted.length; i++) {
      const prevEnd = sorted[i - 1]!.scheduledAt.getTime() + sorted[i - 1]!.estimatedDurationMinutes * 60_000;
      expect(sorted[i]!.scheduledAt.getTime()).toBeGreaterThanOrEqual(prevEnd);
    }
  });

  it("distributes bouts across multiple tatamis instead of stacking them all on one", () => {
    const bouts = [
      bout({ boutId: "b1", roundNumber: 1, redPlayerId: "p1", bluePlayerId: "p2" }),
      bout({ boutId: "b2", roundNumber: 1, redPlayerId: "p3", bluePlayerId: "p4" }),
    ];
    const entries = generateSchedule({
      startAt: START,
      tatamiIds: ["t1", "t2"],
      boutsByCompetition: new Map([["comp-1", bouts]]),
    });
    const tatamiIds = new Set(entries.map((e) => e.tatamiId));
    expect(tatamiIds.size).toBe(2);
    expect(entries.every((e) => e.scheduledAt.getTime() === START.getTime())).toBe(true);
  });

  it("never overlaps a single player's two bouts even across different tatamis", () => {
    const bouts = [
      bout({ boutId: "b1", roundNumber: 1, redPlayerId: "shared", bluePlayerId: "p2" }),
      bout({ boutId: "b2", roundNumber: 1, redPlayerId: "shared", bluePlayerId: "p4" }),
    ];
    const entries = generateSchedule({
      startAt: START,
      tatamiIds: ["t1", "t2"],
      boutsByCompetition: new Map([["comp-1", bouts]]),
    });
    const [first, second] = [...entries].sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());
    const firstEnd = first!.scheduledAt.getTime() + first!.estimatedDurationMinutes * 60_000;
    expect(second!.scheduledAt.getTime()).toBeGreaterThanOrEqual(firstEnd);
  });

  it("round 2 never starts before round 1 of the same competition has finished", () => {
    const bouts = [
      bout({ boutId: "r1b1", roundNumber: 1, redPlayerId: "p1", bluePlayerId: "p2", durationMinutes: 10 }),
      bout({ boutId: "r1b2", roundNumber: 1, redPlayerId: "p3", bluePlayerId: "p4", durationMinutes: 10 }),
      bout({ boutId: "r2b1", roundNumber: 2, redPlayerId: null, bluePlayerId: null, durationMinutes: 10 }),
    ];
    const entries = generateSchedule({
      startAt: START,
      tatamiIds: ["t1", "t2"],
      boutsByCompetition: new Map([["comp-1", bouts]]),
    });
    const round1End = Math.max(
      ...entries
        .filter((e) => e.boutId.startsWith("r1"))
        .map((e) => e.scheduledAt.getTime() + e.estimatedDurationMinutes * 60_000),
    );
    const round2 = entries.find((e) => e.boutId === "r2b1")!;
    expect(round2.scheduledAt.getTime()).toBeGreaterThanOrEqual(round1End);
  });

  it("bye bouts consume no schedule slot", () => {
    const bouts = [
      bout({ boutId: "bye1", roundNumber: 1, redPlayerId: "p1", bluePlayerId: null, isBye: true }),
    ];
    const entries = generateSchedule({
      startAt: START,
      tatamiIds: ["t1"],
      boutsByCompetition: new Map([["comp-1", bouts]]),
    });
    expect(entries).toHaveLength(0);
  });

  it("a blocked period (e.g. lunch) pushes a candidate start time past it", () => {
    const bouts = [
      bout({ boutId: "b1", roundNumber: 1, redPlayerId: "p1", bluePlayerId: "p2", durationMinutes: 5 }),
    ];
    const blockStart = new Date(START);
    const blockEnd = new Date(START.getTime() + 60 * 60_000);
    const entries = generateSchedule({
      startAt: START,
      tatamiIds: ["t1"],
      boutsByCompetition: new Map([["comp-1", bouts]]),
      blockedPeriods: [{ startAt: blockStart, endAt: blockEnd }],
    });
    expect(entries[0]!.scheduledAt.getTime()).toBe(blockEnd.getTime());
  });

  it("no tatamis available produces no schedule entries", () => {
    const bouts = [bout({ boutId: "b1", roundNumber: 1 })];
    const entries = generateSchedule({
      startAt: START,
      tatamiIds: [],
      boutsByCompetition: new Map([["comp-1", bouts]]),
    });
    expect(entries).toHaveLength(0);
  });
});
