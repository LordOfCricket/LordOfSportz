import { useEffect, useState } from 'react'
import { fetchTeam } from '../services/playerApi.js'
import { useAuth } from './useAuth.js'

export function usePlayerDashboard() {
  const { user, player, refreshPlayer } = useAuth()
  const [team, setTeam] = useState(null)
  // Phase 2 Cleanup — without this, isNewPlayer below computes `true` for
  // EVERY player (even one with a full profile) during the brief window
  // before refreshPlayer() resolves, since `player` starts null — a real
  // "misleading empty data" flash, not just a missing spinner. `loading`
  // starts true only when there's actually something to wait for.
  const [loading, setLoading] = useState(!player)

  useEffect(() => {
    // `loading` already initializes to `false` when `player` was already
    // present on mount — only the fetch branch needs to flip it back.
    if (!player) refreshPlayer().finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!player?.team_id) return undefined
    let cancelled = false
    fetchTeam(player.team_id)
      .then((fetchedTeam) => {
        if (!cancelled) setTeam(fetchedTeam)
      })
      .catch(() => {
        if (!cancelled) setTeam(null)
      })
    return () => {
      cancelled = true
    }
  }, [player?.team_id])

  const isNewPlayer = !player?.role && !player?.team_id

  return {
    user,
    player,
    team: player?.team_id ? team : null,
    isNewPlayer,
    loading,
  }
}
