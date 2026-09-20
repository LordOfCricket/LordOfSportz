import { useCallback, useEffect, useState } from 'react'
import { fetchMyUmpireProfile, fetchMyAssignments, fetchMyOfficiatingTrend } from '../services/umpireSelfApi.js'
import { matchesThisMonth, groundsOfficiatedAt, matchesInLastNMonths } from '../models/umpireStatistics.model.js'

// "My Statistics" — composes the two umpire endpoints already used
// elsewhere in this section (no new backend surface). matchesOfficiated/
// ratingAvg/ratingCount come straight from GET /umpire/profile (already
// live-computed server-side, never stale); matchesThisMonth/
// groundsOfficiatedAt are derived client-side from the raw GET
// /umpire/assignments list — real data, not fabricated.
export function useUmpireStatistics() {
  const [profile, setProfile] = useState(null)
  const [assignments, setAssignments] = useState([])
  const [trendMonths, setTrendMonths] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [profileData, assignmentsData, trend] = await Promise.all([fetchMyUmpireProfile(), fetchMyAssignments(), fetchMyOfficiatingTrend(6)])
      setProfile(profileData)
      setAssignments(assignmentsData)
      setTrendMonths(trend)
    } catch (err) {
      setError(err.response?.data?.error || err.response?.data?.message || 'Unable to load your statistics.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(timer)
  }, [load])

  return {
    loading,
    error,
    matchesOfficiated: profile?.matches_officiated ?? 0,
    upcomingAssignments: profile?.upcoming_assignments ?? 0,
    // no_shows/cancellations/reliability all come straight from
    // GET /umpire/profile (getUmpireStats + computeReliability, server-side,
    // sourced from umpire_assignment_events — never fabricated here).
    noShows: profile?.matches_no_show ?? 0,
    cancellations: profile?.matches_cancelled ?? 0,
    reliability: profile?.reliability ?? null,
    ratingAvg: profile?.rating_avg ?? null,
    ratingCount: profile?.rating_count ?? 0,
    matchesThisMonth: matchesThisMonth(assignments),
    groundsOfficiatedAt: groundsOfficiatedAt(assignments),
    lastMonth: matchesInLastNMonths(assignments, 1),
    last3Months: matchesInLastNMonths(assignments, 3),
    verified: profile?.verified ?? false,
    badges: profile?.badges ?? [],
    trendMonths,
    refresh: load,
  }
}
