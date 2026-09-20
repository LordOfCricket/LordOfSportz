import { useCallback, useEffect, useState } from 'react'
import { fetchMatchSummary } from '../services/matchSummaryApi.js'

/** Loads the match summary read model for one match. Always hits the
 * server — no localStorage, no client-side cricket calculation. */
export function useMatchSummary(matchId) {
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(() => {
    return fetchMatchSummary(matchId)
      .then((data) => {
        setSummary(data)
        setError(null)
      })
      .catch((err) => setError(err.response?.status === 404 ? 'Match not found.' : err.response?.data?.message || "Couldn't load this match."))
      .finally(() => setLoading(false))
  }, [matchId])

  // Initial/matchId-change load — `loading` already starts true, nothing to
  // reset synchronously inside the effect itself.
  useEffect(() => {
    load()
  }, [load])

  const retry = useCallback(() => {
    setLoading(true)
    load()
  }, [load])

  // A SILENT refetch (no loading-skeleton flash), used when
  // the live-match poller detects a lifecycle transition (innings break,
  // second innings starting, match completing) and the page needs the full
  // scorecard/Playing XI to catch up without a jarring reload.
  const reload = useCallback(() => load(), [load])

  return { summary, loading, error, retry, reload }
}
