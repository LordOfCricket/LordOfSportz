import { useCallback, useEffect, useState } from 'react'
import { listMatches } from '../services/matchApi.js'
import { fetchMyAvailability, setMyAvailability } from '../services/matchAvailabilityApi.js'

// The player dashboard's "Next Match" widget previously
// always rendered its empty state (NextMatchCard.jsx's own comment: "No
// per-player match schedule/availability API exists yet"). This is that API,
// wired up: the soonest upcoming match for the player's team, plus their own
// RSVP for it.
export function useNextMatchAvailability(teamId) {
  const [match, setMatch] = useState(null)
  const [availability, setAvailability] = useState(null)
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(() => {
    if (!teamId) {
      setLoading(false)
      setMatch(null)
      return undefined
    }
    setLoading(true)
    listMatches()
      .then((all) => {
        const upcoming = all
          .filter((m) => m.status === 'upcoming' && (m.team_a_id === teamId || m.team_b_id === teamId))
          .sort((a, b) => new Date(a.match_date) - new Date(b.match_date))
        const next = upcoming[0] || null
        setMatch(next)
        return next ? fetchMyAvailability(next.id).then(setAvailability) : setAvailability(null)
      })
      .catch(() => {
        setMatch(null)
        setAvailability(null)
      })
      .finally(() => setLoading(false))
    return undefined
  }, [teamId])

  useEffect(() => {
    const timer = window.setTimeout(load, 0)
    return () => window.clearTimeout(timer)
  }, [load])

  const respond = async (status) => {
    if (!match) return
    setUpdating(true)
    setError('')
    try {
      setAvailability(await setMyAvailability(match.id, status))
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to update your availability.')
    } finally {
      setUpdating(false)
    }
  }

  return { match, availability, loading, updating, error, respond }
}
