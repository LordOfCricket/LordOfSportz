import { useCallback, useEffect, useState } from 'react'
import { useAuth } from './useAuth.js'
import {
  fetchPlayerFollowState,
  followPlayer,
  unfollowPlayer,
  fetchTeamFollowState,
  followTeam,
  unfollowTeam,
  fetchGroundFollowState,
  followGround,
  unfollowGround,
} from '../services/followApi.js'

const API = {
  player: { fetch: fetchPlayerFollowState, follow: followPlayer, unfollow: unfollowPlayer },
  team: { fetch: fetchTeamFollowState, follow: followTeam, unfollow: unfollowTeam },
  ground: { fetch: fetchGroundFollowState, follow: followGround, unfollow: unfollowGround },
}

/**
 * Follow state + toggle for a single player/team. Only ever hits the server
 * when a user is logged in (a follow is authenticated-only); a logged-out
 * visitor gets `{ available: false }` and no request is made. `following`
 * is server-authoritative — the toggle re-reads nothing, it just applies
 * the value the mutation endpoint returns, and reverts on error.
 */
export function useFollow(type, id) {
  const { user } = useAuth()
  const available = Boolean(user && id != null)
  const [following, setFollowing] = useState(null)
  const [loading, setLoading] = useState(available)
  const [pending, setPending] = useState(false)

  useEffect(() => {
    let cancelled = false
    // Deferred out of the synchronous effect body (same pattern as
    // useAnalytics.js) so the first setState isn't a cascading render.
    const timer = window.setTimeout(() => {
      if (cancelled) return
      if (!available) {
        setFollowing(null)
        setLoading(false)
        return
      }
      setLoading(true)
      API[type]
        .fetch(id)
        .then((d) => !cancelled && setFollowing(!!d.following))
        .catch(() => !cancelled && setFollowing(false))
        .finally(() => !cancelled && setLoading(false))
    }, 0)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [type, id, available])

  const toggle = useCallback(async () => {
    if (!available || pending) return
    const next = !following
    setPending(true)
    setFollowing(next) // optimistic
    try {
      const d = next ? await API[type].follow(id) : await API[type].unfollow(id)
      setFollowing(!!d.following)
    } catch {
      setFollowing(!next) // revert
    } finally {
      setPending(false)
    }
  }, [available, pending, following, type, id])

  return { available, following, loading, pending, toggle }
}
