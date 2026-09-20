// League -> knockout qualification rule (Part 30/31), centralized so it is
// never hand-coded per component. V1 GROUPS_KNOCKOUT is fixed at exactly two
// groups (A/B) — the exact cross-pairing the spec's own example describes:
//
//   SF1: A1 vs B2
//   SF2: B1 vs A2
//
// Pure LEAGUE has no separate qualification step — the final standings
// winner (standings.js's position 1, after its own documented tie-break) IS
// the champion (Part 31 — "if pure LEAGUE means standings winner only,
// document that").

/**
 * @param {Array} groupAStandings - sorted (position 1 first), from standings.js
 * @param {Array} groupBStandings
 * @returns {[{slot:1, teamAId, teamBId}, {slot:2, teamAId, teamBId}]}
 */
export function crossGroupSemiFinalPairing(groupAStandings, groupBStandings) {
  if (groupAStandings.length < 2 || groupBStandings.length < 2) {
    throw new Error('Both groups need at least 2 teams with standings to determine semi-final qualifiers.')
  }
  const [a1, a2] = groupAStandings
  const [b1, b2] = groupBStandings
  return [
    { slot: 1, teamAId: a1.teamId, teamBId: b2.teamId },
    { slot: 2, teamAId: b1.teamId, teamBId: a2.teamId },
  ]
}
