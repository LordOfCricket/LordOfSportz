// Leaderboard metric catalogue for the mobile Rankings screen.
//
// This is a deliberate 1:1 mirror of the website's METRIC_GROUPS
// (client/src/pages/leaderboards/LeaderboardsPage.jsx) so both platforms
// expose the exact same categories, metric keys and labels. The metric keys
// map to server/src/domain/statistics/leaderboardConfig.js — the single
// source of truth for what each leaderboard actually ranks and its
// qualification thresholds. No metric is invented here.

export type LeaderboardCategory = 'batting' | 'bowling' | 'fielding'

export interface LeaderboardMetricDef {
  key: string
  label: string
}

export const METRIC_GROUPS: Record<LeaderboardCategory, LeaderboardMetricDef[]> = {
  batting: [
    { key: 'runs', label: 'Top Run Scorers' },
    { key: 'sixes', label: 'Most Sixes' },
    { key: 'fours', label: 'Most Fours' },
    { key: 'fifties', label: 'Most 50s' },
    { key: 'hundreds', label: 'Most 100s' },
    { key: 'batting-average', label: 'Best Average' },
    { key: 'batting-strike-rate', label: 'Best Strike Rate' },
  ],
  bowling: [
    { key: 'wickets', label: 'Top Wicket Takers' },
    { key: 'maidens', label: 'Most Maidens' },
    { key: 'bowling-average', label: 'Best Average' },
    { key: 'economy', label: 'Best Economy' },
    { key: 'best-bowling', label: 'Best Figures' },
  ],
  fielding: [
    { key: 'catches', label: 'Most Catches' },
    { key: 'run-outs', label: 'Most Run Outs' },
    { key: 'stumpings', label: 'Most Stumpings' },
  ],
}

export const CATEGORIES: LeaderboardCategory[] = ['batting', 'bowling', 'fielding']

export function metricCategory(metric: string): LeaderboardCategory {
  return CATEGORIES.find((cat) => METRIC_GROUPS[cat].some((m) => m.key === metric)) || 'batting'
}

/**
 * Human-readable qualification note for a leaderboard, mirroring the
 * website's qualificationText() exactly. `qualification` comes straight off
 * the leaderboard response (null for counting metrics that only need
 * "greater than zero").
 */
export function qualificationText(
  qualification: {
    minInnings?: number
    minDismissals?: number
    minBallsFaced?: number
    minWickets?: number
    minEquivalentOvers?: number
  } | null
): string | null {
  if (!qualification) return null
  const parts: string[] = []
  if (qualification.minInnings) parts.push(`min ${qualification.minInnings} innings`)
  if (qualification.minDismissals)
    parts.push(`min ${qualification.minDismissals} dismissal${qualification.minDismissals > 1 ? 's' : ''}`)
  if (qualification.minBallsFaced) parts.push(`min ${qualification.minBallsFaced} balls faced`)
  if (qualification.minWickets) parts.push(`min ${qualification.minWickets} wickets`)
  if (qualification.minEquivalentOvers) parts.push(`min ${qualification.minEquivalentOvers} overs bowled`)
  return parts.length ? `Qualification: ${parts.join(', ')}` : null
}
