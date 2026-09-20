/**
 * Round-robin GROUP STANDINGS aggregation — Art. 5.11 (individual) / 5.12
 * (team) of the verified WKF Kata Competition Rules 2026.0. Deliberately
 * separate from the single-bout result engine (kataEngine.ts): this layer
 * only aggregates already-finalized Bout results, never recomputes a bout's
 * own winner.
 *
 * A "group" here is the existing Draw primitive: one ROUND_ROBIN Draw's
 * entrants and bouts (Phase 10) — no new grouping/pool concept is introduced.
 */

export interface StandingBoutResult {
  redPlayerId: string;
  bluePlayerId: string;
  winnerPlayerId: string;
  redVotes: number;
  blueVotes: number;
}

export interface StandingRow {
  playerId: string;
  victoryPoints: number;
  wins: number;
  totalVotesFor: number;
  totalVotesAgainst: number;
  rank: number;
  /** True when this row's position relative to other same-rank rows could not be resolved by any rule-defined criterion (Art. 5.11 items 1-3) and requires an extra-Kata performance (item 5) — never auto-decided. */
  tieUnresolved: boolean;
}

function headToHeadWinner(a: string, b: string, results: StandingBoutResult[]): string | null {
  const bout = results.find(
    (r) => (r.redPlayerId === a && r.bluePlayerId === b) || (r.redPlayerId === b && r.bluePlayerId === a),
  );
  return bout?.winnerPlayerId ?? null;
}

/**
 * Art. 5.11 order of precedence: 1) victory points, 2) head-to-head (2-way
 * ties only — it doesn't generalize to 3+ way ties), 3) sum of votes-for
 * across the group, 4) World Ranking (not available in this system — skipped,
 * never faked), 5) extra Kata (a real authorized official action, not
 * something this pure function can perform — reported as tieUnresolved).
 */
export function computeRoundRobinStandings(playerIds: string[], results: StandingBoutResult[]): StandingRow[] {
  const stats = new Map<string, { victoryPoints: number; wins: number; votesFor: number; votesAgainst: number }>();
  for (const id of playerIds) stats.set(id, { victoryPoints: 0, wins: 0, votesFor: 0, votesAgainst: 0 });

  for (const r of results) {
    const red = stats.get(r.redPlayerId);
    const blue = stats.get(r.bluePlayerId);
    if (!red || !blue) continue;
    red.votesFor += r.redVotes;
    red.votesAgainst += r.blueVotes;
    blue.votesFor += r.blueVotes;
    blue.votesAgainst += r.redVotes;
    if (r.winnerPlayerId === r.redPlayerId) {
      red.victoryPoints += 3;
      red.wins += 1;
    } else if (r.winnerPlayerId === r.bluePlayerId) {
      blue.victoryPoints += 3;
      blue.wins += 1;
    }
  }

  // Stable ordering: sort by victory points, group into equal-points buckets, resolve each bucket independently.
  const ordered = [...playerIds].sort((a, b) => stats.get(b)!.victoryPoints - stats.get(a)!.victoryPoints);
  const buckets: string[][] = [];
  for (const id of ordered) {
    const last = buckets[buckets.length - 1];
    if (last && stats.get(last[0]!)!.victoryPoints === stats.get(id)!.victoryPoints) {
      last.push(id);
    } else {
      buckets.push([id]);
    }
  }

  const rows: StandingRow[] = [];
  let rank = 1;
  for (const bucket of buckets) {
    let resolvedOrder: string[];
    let tieUnresolved = false;

    if (bucket.length === 1) {
      resolvedOrder = bucket;
    } else if (bucket.length === 2) {
      const winner = headToHeadWinner(bucket[0]!, bucket[1]!, results);
      if (winner) {
        resolvedOrder = winner === bucket[0] ? bucket : [bucket[1]!, bucket[0]!];
      } else {
        resolvedOrder = [...bucket].sort((a, b) => stats.get(b)!.votesFor - stats.get(a)!.votesFor);
        tieUnresolved = stats.get(resolvedOrder[0]!)!.votesFor === stats.get(resolvedOrder[1]!)!.votesFor;
      }
    } else {
      resolvedOrder = [...bucket].sort((a, b) => stats.get(b)!.votesFor - stats.get(a)!.votesFor);
      // If votes-for also ties within any sub-group, those specific members remain unresolved (Art. 5.11 item 4-5).
      tieUnresolved = resolvedOrder.some(
        (id, i) => i > 0 && stats.get(id)!.votesFor === stats.get(resolvedOrder[i - 1]!)!.votesFor,
      );
    }

    for (const id of resolvedOrder) {
      const s = stats.get(id)!;
      rows.push({
        playerId: id,
        victoryPoints: s.victoryPoints,
        wins: s.wins,
        totalVotesFor: s.votesFor,
        totalVotesAgainst: s.votesAgainst,
        rank,
        tieUnresolved,
      });
      rank += 1;
    }
  }

  return rows;
}
