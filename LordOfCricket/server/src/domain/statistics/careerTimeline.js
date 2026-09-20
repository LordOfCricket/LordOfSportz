// Pure career-timeline derivation — no pg, no I/O. Groups the SAME
// chronological finalized-match performance list statistics.service.js
// already builds by calendar year, resolving each year's team(s) from the
// real per-match `match_players.team_id` snapshot carried on every
// performance (NEVER the player's current `players.team_id`). Team display
// names/logos come from the already-computed `teamHistory`. Earned
// milestones are slotted into the year of their real `achievedOn.date` — no
// dates are invented; a milestone with no `achievedOn` simply doesn't appear.

/** Timezone-proof year extraction — reads the literal leading YYYY of a
 * date-only / ISO string (the same approach client-side formatDate uses),
 * falling back to a Date only for non-string inputs. */
function yearOf(value) {
  if (typeof value === 'string') {
    const m = /^(\d{4})-\d{2}-\d{2}/.exec(value)
    if (m) return Number(m[1])
    const d = new Date(value)
    return Number.isNaN(d.getTime()) ? null : d.getUTCFullYear()
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.getUTCFullYear()
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d.getUTCFullYear()
}

/**
 * @param {Array} chronoPerformances - FULL per-match performance list, OLDEST-FIRST
 * @param {Array} teamHistory - the `teamHistory` block from getPlayerCareerStats
 * @param {Array} earnedAchievements - `achievements.earned` from computeCareerAchievements
 * @returns {object[]} one entry per calendar year, NEWEST YEAR FIRST
 */
export function buildCareerTimeline({ chronoPerformances = [], teamHistory = [], earnedAchievements = [] } = {}) {
  const teamMeta = new Map(
    teamHistory.map((t) => [t.teamId, { teamId: t.teamId, name: t.name, shortName: t.shortName, logoUrl: t.logoUrl }])
  )

  const byYear = new Map()
  for (const perf of chronoPerformances) {
    const year = yearOf(perf.date)
    if (year == null) continue
    if (!byYear.has(year)) byYear.set(year, { year, matches: 0, runs: 0, wickets: 0, teamsById: new Map(), milestones: [] })
    const bucket = byYear.get(year)
    bucket.matches += 1
    if (perf.batting && perf.batting.didBat) bucket.runs += perf.batting.runs
    if (perf.bowling && perf.bowling.didBowl) bucket.wickets += perf.bowling.wickets
    if (perf.teamId != null) {
      const meta = teamMeta.get(perf.teamId) || { teamId: perf.teamId, name: null, shortName: null, logoUrl: null }
      const entry = bucket.teamsById.get(perf.teamId) || { ...meta, matches: 0 }
      entry.matches += 1
      bucket.teamsById.set(perf.teamId, entry)
    }
  }

  for (const a of earnedAchievements) {
    if (!a.achievedOn || !a.achievedOn.date) continue
    const year = yearOf(a.achievedOn.date)
    const bucket = year != null ? byYear.get(year) : null
    if (bucket) bucket.milestones.push({ id: a.id, title: a.title, matchId: a.achievedOn.matchId, opponent: a.achievedOn.opponent })
  }

  return [...byYear.values()]
    .map((b) => ({
      year: b.year,
      matches: b.matches,
      runs: b.runs,
      wickets: b.wickets,
      teams: [...b.teamsById.values()].sort((x, y) => y.matches - x.matches),
      milestones: b.milestones,
    }))
    .sort((a, b) => b.year - a.year)
}
