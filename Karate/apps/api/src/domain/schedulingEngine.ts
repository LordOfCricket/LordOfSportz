import { DEFAULT_BOUT_DURATION_MINUTES } from "@karate/types";

export interface SchedulableBout {
  boutId: string;
  competitionId: string;
  roundNumber: number;
  redPlayerId: string | null;
  bluePlayerId: string | null;
  /** true when exactly one side is a bye — these never get a real time slot. */
  isBye: boolean;
  durationMinutes: number | null;
}

export interface BlockedPeriod {
  startAt: Date;
  endAt: Date;
}

export interface SchedulingInput {
  startAt: Date;
  tatamiIds: string[];
  /** Grouped by competition, each competition's bouts already ordered by round then sequence. */
  boutsByCompetition: Map<string, SchedulableBout[]>;
  blockedPeriods?: BlockedPeriod[];
  breakMinutesBetweenRounds?: number;
}

export interface ScheduledEntry {
  boutId: string;
  tatamiId: string;
  scheduledAt: Date;
  estimatedDurationMinutes: number;
  sequenceOrder: number;
}

function pushPastBlockedPeriods(candidate: Date, blockedPeriods: BlockedPeriod[]): Date {
  let time = candidate;
  let movedAny = true;
  // Loop because moving past one blocked period could land inside another.
  while (movedAny) {
    movedAny = false;
    for (const period of blockedPeriods) {
      if (time >= period.startAt && time < period.endAt) {
        time = period.endAt;
        movedAny = true;
      }
    }
  }
  return time;
}

/**
 * Greedy but real scheduler: never double-books a tatami (each has its own
 * running "free at" cursor), never overlaps a single player's two bouts
 * (tracked per playerId), and never starts round N of a competition before
 * round N-1 of that SAME competition has finished (elimination and
 * round-robin both need this — a player physically can't be mid-bout in two
 * rounds at once). Byes never consume a slot. Blocked periods (e.g. lunch)
 * push any candidate start time to after the block.
 */
export function generateSchedule(input: SchedulingInput): ScheduledEntry[] {
  const blockedPeriods = input.blockedPeriods ?? [];
  const breakMinutes = input.breakMinutesBetweenRounds ?? 0;

  const tatamiFreeAt = new Map<string, Date>(input.tatamiIds.map((id) => [id, input.startAt]));
  const tatamiSequence = new Map<string, number>(input.tatamiIds.map((id) => [id, 0]));
  const playerFreeAt = new Map<string, Date>();
  const entries: ScheduledEntry[] = [];

  if (input.tatamiIds.length === 0) {
    return entries;
  }

  for (const bouts of input.boutsByCompetition.values()) {
    let roundReadyAt = input.startAt;
    let currentRound = bouts[0]?.roundNumber;
    let roundEndTimes: Date[] = [];

    for (const bout of bouts) {
      if (bout.roundNumber !== currentRound) {
        roundReadyAt =
          roundEndTimes.length > 0
            ? new Date(Math.max(...roundEndTimes.map((d) => d.getTime())) + breakMinutes * 60_000)
            : roundReadyAt;
        roundEndTimes = [];
        currentRound = bout.roundNumber;
      }

      if (bout.isBye) continue; // no physical bout, no slot consumed

      const duration = bout.durationMinutes ?? DEFAULT_BOUT_DURATION_MINUTES;

      // Pick whichever tatami is free soonest.
      let bestTatami = input.tatamiIds[0]!;
      for (const id of input.tatamiIds) {
        if (tatamiFreeAt.get(id)!.getTime() < tatamiFreeAt.get(bestTatami)!.getTime()) bestTatami = id;
      }

      const redFreeAt = bout.redPlayerId
        ? (playerFreeAt.get(bout.redPlayerId) ?? input.startAt)
        : input.startAt;
      const blueFreeAt = bout.bluePlayerId
        ? (playerFreeAt.get(bout.bluePlayerId) ?? input.startAt)
        : input.startAt;

      let candidate = new Date(
        Math.max(
          tatamiFreeAt.get(bestTatami)!.getTime(),
          roundReadyAt.getTime(),
          redFreeAt.getTime(),
          blueFreeAt.getTime(),
        ),
      );
      candidate = pushPastBlockedPeriods(candidate, blockedPeriods);

      const sequenceOrder = (tatamiSequence.get(bestTatami) ?? 0) + 1;
      tatamiSequence.set(bestTatami, sequenceOrder);
      entries.push({
        boutId: bout.boutId,
        tatamiId: bestTatami,
        scheduledAt: candidate,
        estimatedDurationMinutes: duration,
        sequenceOrder,
      });

      const end = new Date(candidate.getTime() + duration * 60_000);
      tatamiFreeAt.set(bestTatami, end);
      if (bout.redPlayerId) playerFreeAt.set(bout.redPlayerId, end);
      if (bout.bluePlayerId) playerFreeAt.set(bout.bluePlayerId, end);
      roundEndTimes.push(end);
    }
  }

  return entries;
}
