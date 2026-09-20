import { useEffect, useState } from 'react'
import { fetchMyGrounds } from '../services/groundOwnerApi.js'

// A lightweight self-check, same posture as NotificationBell.jsx already
// fetching in the navbar on every load — there's no ground-ownership signal
// on the user object itself (unlike player_type for umpires), so this is
// the only way to know whether to show Ground Owner navigation without
// exposing it to unrelated users.
export function useIsGroundOwner(enabled) {
  const [isOwner, setIsOwner] = useState(false)

  useEffect(() => {
    if (!enabled) return
    fetchMyGrounds()
      .then((grounds) => setIsOwner(grounds.length > 0))
      .catch(() => setIsOwner(false))
  }, [enabled])

  return isOwner
}
