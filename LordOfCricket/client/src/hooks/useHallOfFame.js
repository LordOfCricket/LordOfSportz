import { useEffect, useState } from 'react'
import { fetchLeaderboard, fetchPublicPlayerInfo } from '../services/statisticsApi.js'

// A player with this few career matches and still near the top of the runs
// board reads as "emerging," not "established" — a real, derivable signal
// from data that already exists (career.matches), not a fabricated flag.
// There's no age/DOB field anywhere in the schema (confirmed during
// research) — "emerging" can only ever mean "strong stats, few matches",
// never "young".
// Exported so useNextGeneration.js uses the exact same "emerging" threshold
// instead of a second magic number drifting out of sync.
export const EMERGING_MAX_MATCHES = 5
const EMERGING_POOL_SIZE = 20

/** Hall of Fame — 4 real, all-time categories (no "this week": the backend
 * has no date-ranged leaderboard, so this is honestly framed as all-time
 * rather than faking a weekly claim). Each category is one real leaderboard
 * #1: Top Performer = most career runs, Max Scorer = highest single-innings
 * score (career.batting.highestScore, Stage 2's new metric), Max Wickets =
 * most career wickets, Emerging Player = the best runs performer with
 * EMERGING_MAX_MATCHES or fewer matches played. Leaderboard responses don't
 * include a photo, so the few actual winners get one extra profile fetch
 * each for photoUrl. */
export function useHallOfFame() {
  const [categories, setCategories] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false

    Promise.all([
      fetchLeaderboard('runs', { limit: EMERGING_POOL_SIZE }),
      fetchLeaderboard('highest-score', { limit: 1 }),
      fetchLeaderboard('wickets', { limit: 1 }),
    ])
      .then(async ([runsBoard, scoreBoard, wicketsBoard]) => {
        if (cancelled) return

        const topPerformer = runsBoard.items[0] || null
        const maximumScore = scoreBoard.items[0] || null
        const maximumWickets = wicketsBoard.items[0] || null
        const emergingPlayer = runsBoard.items.find((i) => (i.secondary?.matches ?? Infinity) <= EMERGING_MAX_MATCHES) || null

        // A small stats table per card, not one sentence — every row is a
        // real field the leaderboard already returns (career.matches/
        // average/strikeRate/economy via leaderboardConfig.js's
        // battingSecondary/bowlingSecondary), '—' only when that field is
        // genuinely null (e.g. average is null for a never-dismissed
        // player), never a fabricated number.
        const battingRows = (i) => [
          { label: 'Matches', value: i.secondary?.matches ?? '—' },
          { label: 'Average', value: i.secondary?.average ?? '—' },
          { label: 'Strike Rate', value: i.secondary?.strikeRate ?? '—' },
        ]
        const entries = [
          {
            key: 'topPerformer',
            label: 'Top Performer',
            item: topPerformer,
            headline: (i) => `${i.value} Runs`,
            rows: (i) => battingRows(i),
          },
          {
            key: 'maximumScore',
            label: 'Max Scorer',
            item: maximumScore,
            headline: (i) => `${i.value.runs}${i.value.notOut ? '*' : ''} Runs`,
            rows: (i) => [{ label: 'Best Innings', value: `${i.value.runs}${i.value.notOut ? '*' : ''}` }, ...battingRows(i)],
          },
          {
            key: 'maximumWickets',
            label: 'Max Wickets',
            item: maximumWickets,
            headline: (i) => `${i.value} Wickets`,
            rows: (i) => [
              { label: 'Matches', value: i.secondary?.matches ?? '—' },
              { label: 'Average', value: i.secondary?.average ?? '—' },
              { label: 'Economy', value: i.secondary?.economy ?? '—' },
            ],
          },
          {
            key: 'emergingPlayer',
            label: 'Emerging Player',
            item: emergingPlayer,
            headline: (i) => `${i.value} Runs`,
            rows: (i) => battingRows(i),
          },
        ]

        // De-duped extra fetch (a prolific low-match player can legitimately
        // win two categories at once) for the one field leaderboards don't carry.
        const uniqueIds = [...new Set(entries.filter((e) => e.item).map((e) => e.item.player.publicPlayerId))]
        const profiles = await Promise.all(uniqueIds.map((id) => fetchPublicPlayerInfo(id).catch(() => null)))
        const photoById = Object.fromEntries(uniqueIds.map((id, i) => [id, profiles[i]?.photoUrl ?? null]))

        if (cancelled) return
        setCategories(
          entries.map((e) => ({
            key: e.key,
            label: e.label,
            player: e.item
              ? {
                  publicPlayerId: e.item.player.publicPlayerId,
                  name: e.item.player.name,
                  role: e.item.player.role,
                  photoUrl: photoById[e.item.player.publicPlayerId] ?? null,
                  headline: e.headline(e.item),
                  stats: e.rows(e.item),
                }
              : null,
          })),
        )
      })
      .catch((err) => {
        if (!cancelled) setError(err.response?.data?.error || "Couldn't load the Hall of Fame.")
      })

    return () => {
      cancelled = true
    }
  }, [])

  return { categories, loading: categories === null && error === null, error }
}
