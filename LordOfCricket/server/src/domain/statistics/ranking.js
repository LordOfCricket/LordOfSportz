// Pure ranking engine — no pg, no I/O. Takes {player, career} entries (already
// computed by statistics.service.js from finalized-match history) and a
// metric config from leaderboardConfig.js, and produces a deterministic,
// globally-ordered, ranked list. This is the ONE sorting/ranking
// implementation every leaderboard goes through — no per-metric bespoke
// comparator lives anywhere else (Part 19/20).

/**
 * `metricConfig.sortKey(career, player)` must return an array of numbers,
 * already oriented so that HIGHER IS ALWAYS BETTER (callers negate "lower is
 * better" values like bowling average/economy themselves — see
 * leaderboardConfig.js). Compared element-by-element; the first non-equal
 * element decides. `null`/`undefined` sort as the worst possible value.
 * After every configured key is exhausted, `player.publicPlayerId` (string,
 * ascending) is the final tie-breaker — guarantees a total order, so
 * pagination can never return the same player twice or skip one.
 */
function compareEntries(a, b, sortKey) {
  const ka = sortKey(a.career, a.player)
  const kb = sortKey(b.career, b.player)
  for (let i = 0; i < ka.length; i++) {
    const av = ka[i] ?? -Infinity
    const bv = kb[i] ?? -Infinity
    if (av !== bv) return bv - av
  }
  if (a.player.publicPlayerId < b.player.publicPlayerId) return -1
  if (a.player.publicPlayerId > b.player.publicPlayerId) return 1
  return 0
}

/**
 * Ordinal ranking (1,2,3,4 — never 1,2,2,4): simplest deterministic scheme,
 * explicitly acceptable for LOC's initial scale (Part 21/52). Rank is
 * assigned server-side over the FULL qualified/sorted set before pagination
 * is applied, so page 2 correctly starts at rank `offset + 1`, never rank 1.
 */
export function rankPlayers(entries, metricConfig, { limit, offset = 0 } = {}) {
  const qualified = entries.filter((e) => metricConfig.qualifies(e.career))
  const sorted = qualified.slice().sort((a, b) => compareEntries(a, b, metricConfig.sortKey))
  const ranked = sorted.map((e, i) => ({ rank: i + 1, player: e.player, career: e.career }))
  const total = ranked.length
  const page = limit != null ? ranked.slice(offset, offset + limit) : ranked.slice(offset)
  return { total, items: page }
}
