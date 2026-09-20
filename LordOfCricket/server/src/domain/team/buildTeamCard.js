// Phase 10 Part 2 — pure lightweight public team-card DTO from one joined SQL
// row (teams + correlated-subquery counts). No pg, no I/O. Mirrors Phase 10
// Part 1's buildMatchCard.js pattern: list payload stays deliberately small
// (Part 9/44) — never the full profile shape.

export function buildTeamCard(row) {
  const matches = Number(row.match_count)
  const wins = Number(row.win_count)
  const ties = Number(row.tie_count)
  return {
    id: row.id,
    name: row.name,
    shortName: row.short_name,
    logoUrl: row.logo_url,
    squadCount: Number(row.squad_count),
    matchCount: matches,
    wins,
    losses: Math.max(0, matches - wins - ties),
  }
}
