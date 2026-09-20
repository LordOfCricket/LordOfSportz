import { useEffect, useState } from 'react'
import { fetchLeaderboard, fetchPublicPlayerInfo } from '../services/statisticsApi.js'
import { EMERGING_MAX_MATCHES } from './useHallOfFame.js'

const POOL_SIZE = 30
const MAX_SHOWN = 8

/** "THE NEXT GENERATION" — a broader horizontal showcase than Hall of
 * Fame's single Emerging Player pick, same real, derivable criteria (no
 * age/DOB field exists anywhere in the schema — "emerging" can only mean
 * strong stats with few career matches, never "young"). Pulled from the
 * real runs leaderboard, filtered client-side to career.matches <=
 * EMERGING_MAX_MATCHES — no new backend endpoint needed. */
export function useNextGeneration() {
  const [players, setPlayers] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    fetchLeaderboard('runs', { limit: POOL_SIZE })
      .then(async (board) => {
        if (cancelled) return
        const emerging = board.items.filter((i) => (i.secondary?.matches ?? Infinity) <= EMERGING_MAX_MATCHES).slice(0, MAX_SHOWN)
        const profiles = await Promise.all(emerging.map((i) => fetchPublicPlayerInfo(i.player.publicPlayerId).catch(() => null)))
        if (cancelled) return
        setPlayers(
          emerging.map((i, idx) => ({
            publicPlayerId: i.player.publicPlayerId,
            name: i.player.name,
            role: i.player.role,
            photoUrl: profiles[idx]?.photoUrl ?? null,
            runs: i.value,
            matches: i.secondary?.matches ?? null,
            average: i.secondary?.average ?? null,
          })),
        )
      })
      .catch((err) => {
        if (!cancelled) setError(err.response?.data?.error || "Couldn't load emerging players.")
      })
    return () => {
      cancelled = true
    }
  }, [])

  return { players, loading: players === null && error === null, error }
}
