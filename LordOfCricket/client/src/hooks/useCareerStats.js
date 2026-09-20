import { useCallback, useEffect, useState } from 'react'
import { fetchMyStats, fetchPlayerStats } from '../services/statisticsApi.js'

const DEFAULT_MATCH_HISTORY_LIMIT = 10

/**
 * Loads official career statistics for either the signed-in user (no args)
 * or a specific player by public ID. Always hits PostgreSQL through the
 * statistics API — never reads/writes localStorage — so a browser refresh
 * always reproduces identical numbers (an acceptance requirement).
 */
export function useCareerStats(publicPlayerId = null) {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  // Distinguishes "this account has no linked player profile yet" (an
  // expected state for staff/umpire-only accounts — GET /me/stats 404s by
  // design, see statistics.controller.js#getMyStats) from a genuine fetch
  // failure. Consumers should show StatsEmptyState for this, never
  // StatsErrorState with a Retry button that would just 404 again.
  const [noPlayerProfile, setNoPlayerProfile] = useState(false)
  const [matchHistoryLimit, setMatchHistoryLimit] = useState(DEFAULT_MATCH_HISTORY_LIMIT)

  const fetchStats = useCallback(
    (limit) => {
      const request = publicPlayerId ? fetchPlayerStats(publicPlayerId, { limit }) : fetchMyStats({ limit })
      return request
        .then((data) => {
          setStats(data)
          setError(null)
          setNoPlayerProfile(false)
        })
        .catch((err) => {
          if (!publicPlayerId && err.response?.status === 404) {
            setNoPlayerProfile(true)
            setError(null)
          } else {
            setError(err.response?.data?.message || "Couldn't load career statistics.")
          }
        })
        .finally(() => setLoading(false))
    },
    [publicPlayerId]
  )

  // Initial/publicPlayerId-change load: no synchronous setLoading(true) here —
  // `loading` already starts true, so nothing needs resetting on first mount.
  useEffect(() => {
    fetchStats(matchHistoryLimit)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publicPlayerId])

  const retry = useCallback(() => {
    setLoading(true)
    fetchStats(matchHistoryLimit)
  }, [fetchStats, matchHistoryLimit])

  const loadMoreMatchHistory = useCallback(() => {
    const next = matchHistoryLimit + DEFAULT_MATCH_HISTORY_LIMIT
    setMatchHistoryLimit(next)
    setLoading(true)
    fetchStats(next)
  }, [matchHistoryLimit, fetchStats])

  return { stats, loading, error, noPlayerProfile, retry, loadMoreMatchHistory }
}
