import type { BracketType, SeedSourceValue } from "@karate/types";
import { ValidationError } from "@karate/shared";

export interface DrawEntrant {
  registrationId: string;
  playerId: string;
  /** Ordering key already resolved by the caller per the requested seed source — index 0 is the top seed / first pick. */
}

export interface ResolvedSeed {
  registrationId: string;
  playerId: string;
  seedNumber: number | null;
  position: number;
}

function nextPowerOfTwo(n: number): number {
  let size = 1;
  while (size < n) size *= 2;
  return size;
}

/**
 * The canonical recursive bracket-seeding order (1,2 -> 1,2 -> 1,4,2,3 ->
 * 1,8,4,5,2,7,3,6 -> ...), the same placement scheme real tournament
 * software uses so top seeds can only meet in later rounds. Returns, for
 * each 0-indexed bracket slot, which seed rank (1-based) belongs there.
 */
export function computeSeedPositions(bracketSize: number): number[] {
  let positions = [1];
  while (positions.length < bracketSize) {
    const size = positions.length * 2;
    const next: number[] = [];
    for (const p of positions) {
      next.push(p, size + 1 - p);
    }
    positions = next;
  }
  return positions;
}

/**
 * Places entrants (already ordered by the caller: index 0 = seed 1) into
 * bracket slots using the canonical seeding order. Entries beyond
 * `entrants.length` become explicit byes (`null`) — never a fabricated
 * player. `seedNumber` is only recorded when the request actually implied
 * one (RANDOM/NONE leave every entrant unseeded, matching seedSource).
 */
export function assignSingleEliminationSlots(
  entrants: DrawEntrant[],
  seedSource: SeedSourceValue,
): { bracketSize: number; slots: (ResolvedSeed | null)[] } {
  const bracketSize = nextPowerOfTwo(entrants.length);
  const seedPositions = computeSeedPositions(bracketSize);
  const recordSeedNumber = seedSource === "MANUAL" || seedSource === "RANKING";

  const slots: (ResolvedSeed | null)[] = seedPositions.map((seedRank, position) => {
    const entrant = entrants[seedRank - 1];
    if (!entrant) return null;
    return {
      registrationId: entrant.registrationId,
      playerId: entrant.playerId,
      seedNumber: recordSeedNumber ? seedRank : null,
      position,
    };
  });

  return { bracketSize, slots };
}

export interface GeneratedBout {
  roundNumber: number;
  sequenceNumber: number;
  redPlayerId: string | null;
  bluePlayerId: string | null;
}

export interface GeneratedRound {
  roundNumber: number;
  name: string;
  bouts: GeneratedBout[];
}

function roundName(roundIndex: number, totalRounds: number): string {
  const remaining = totalRounds - roundIndex; // 1 = final
  if (remaining === 1) return "Final";
  if (remaining === 2) return "Semifinal";
  if (remaining === 3) return "Quarterfinal";
  return `Round ${roundIndex}`;
}

/**
 * Generates every round upfront. A bye resolves immediately (the lone real
 * player advances into the next round's slot, exactly like paper brackets
 * always worked); a real, undecided matchup leaves the next round's slot as
 * null (TBD) — resolving that is the future Bout Engine's job, explicitly
 * out of scope here.
 */
export function generateSingleEliminationRounds(slots: (ResolvedSeed | null)[]): GeneratedRound[] {
  const bracketSize = slots.length;
  if (bracketSize < 2) {
    throw new ValidationError("A single-elimination draw needs at least 2 entrants.");
  }
  const totalRounds = Math.log2(bracketSize);
  const rounds: GeneratedRound[] = [];
  let currentSlots: (string | null)[] = slots.map((s) => s?.playerId ?? null);

  for (let roundIndex = 1; roundIndex <= totalRounds; roundIndex++) {
    const bouts: GeneratedBout[] = [];
    const nextSlots: (string | null)[] = [];
    for (let i = 0; i < currentSlots.length; i += 2) {
      const red = currentSlots[i] ?? null;
      const blue = currentSlots[i + 1] ?? null;
      bouts.push({
        roundNumber: roundIndex,
        sequenceNumber: bouts.length + 1,
        redPlayerId: red,
        bluePlayerId: blue,
      });
      const bothPresent = red !== null && blue !== null;
      const exactlyOnePresent = (red !== null) !== (blue !== null);
      nextSlots.push(exactlyOnePresent ? (red ?? blue) : bothPresent ? null : null);
    }
    rounds.push({ roundNumber: roundIndex, name: roundName(roundIndex, totalRounds), bouts });
    currentSlots = nextSlots;
  }
  return rounds;
}

/**
 * Standard circle/polygon method. Participants are padded to an even count
 * with an explicit bye slot (never a fake player); a round's pairing that
 * includes the bye slot produces no Bout row at all — a round-robin bye is
 * "this player rests this round," not an elimination auto-advance, so
 * recording a phantom bout for it would misrepresent the format.
 */
export function generateRoundRobinRounds(entrants: DrawEntrant[]): GeneratedRound[] {
  if (entrants.length < 2) {
    throw new ValidationError("A round-robin draw needs at least 2 entrants.");
  }
  const ids: (string | null)[] = entrants.map((e) => e.playerId);
  if (ids.length % 2 !== 0) ids.push(null);

  const n = ids.length;
  const totalRounds = n - 1;
  const rounds: GeneratedRound[] = [];
  const fixed = ids[0]!;
  let rotating = ids.slice(1);

  for (let roundIndex = 1; roundIndex <= totalRounds; roundIndex++) {
    const roundPairs: [string | null, string | null][] = [[fixed, rotating[rotating.length - 1]!]];
    for (let i = 0; i < (rotating.length - 1) / 2; i++) {
      roundPairs.push([rotating[i]!, rotating[rotating.length - 2 - i]!]);
    }
    const bouts: GeneratedBout[] = [];
    for (const [red, blue] of roundPairs) {
      if (red === null || blue === null) continue; // the bye slot's pairing this round — no bout row
      bouts.push({
        roundNumber: roundIndex,
        sequenceNumber: bouts.length + 1,
        redPlayerId: red,
        bluePlayerId: blue,
      });
    }
    rounds.push({ roundNumber: roundIndex, name: `Round ${roundIndex}`, bouts });
    rotating = [rotating[rotating.length - 1]!, ...rotating.slice(0, rotating.length - 1)];
  }
  return rounds;
}

export function generateRounds(
  bracketType: BracketType,
  slots: (ResolvedSeed | null)[],
  entrants: DrawEntrant[],
): GeneratedRound[] {
  if (bracketType === "SINGLE_ELIMINATION") {
    return generateSingleEliminationRounds(slots);
  }
  if (bracketType === "ROUND_ROBIN") {
    return generateRoundRobinRounds(entrants);
  }
  throw new ValidationError(`Bracket type ${bracketType} is not supported yet.`);
}
