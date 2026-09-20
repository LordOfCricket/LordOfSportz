import { useEffect, useState } from 'react'
import { fetchPublicMatches } from '../services/publicMatchApi.js'
import { fetchMatchSummary } from '../services/matchSummaryApi.js'

/** "Beyond the Scorecard" — real per-innings wagon-wheel data from the most
 * recently finished match (GET /matches/:matchId/summary, the same read
 * model MatchSummaryPage/WagonWheelSection already use). There is no
 * cross-match aggregate wagon-wheel endpoint — this deliberately features
 * ONE real match's ONE innings, never fabricated shot coordinates. If no
 * match has finished yet (true today), `innings` stays null and the caller
 * shows an honest "coming soon" state — this will start showing a real
 * match automatically the moment one finalizes, no code change needed. */
export function useFeaturedWagonWheel() {
  const [summary, setSummary] = useState(undefined) // undefined = loading, null = no finished match
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    fetchPublicMatches({ category: 'RESULTS', limit: 1 })
      .then((data) => {
        const latest = data.items[0]
        if (!latest) {
          if (!cancelled) setSummary(null)
          return
        }
        return fetchMatchSummary(latest.id).then((full) => {
          if (!cancelled) setSummary(full)
        })
      })
      .catch((err) => {
        if (!cancelled) setError(err.response?.data?.error || "Couldn't load match analytics.")
      })
    return () => {
      cancelled = true
    }
  }, [])

  const innings = summary ? summary.innings.find((i) => i.wagonWheel.length > 0) || summary.innings[summary.innings.length - 1] || null : null

  return { summary, innings, loading: summary === undefined && error === null, error }
}
