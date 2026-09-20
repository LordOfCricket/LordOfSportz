import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchGroundMatches } from '../services/groundOwnerApi'
import { useAuthStore } from '../store/authStore'
import { useStaffScope, staffKeys } from './useStaffMemberships'
import { hasStaffPermission } from '../utils/staffPermissions'

// Staff-scoped view of the ground's matches. Same endpoint the owner uses
// (GET /ground-owner/grounds/:id/matches, requireGroundPermission MATCH_VIEW)
// — gated here on the active membership's actual grant. There is no
// dedicated staff match-detail endpoint, so detail screens read from this
// same list.
export function useStaffMatches() {
  const userId = useAuthStore((s) => s.user?.id)
  const { activeMembership, publicGroundId, membershipStatus } = useStaffScope()
  const canView = hasStaffPermission(activeMembership, 'MATCH_VIEW')

  const query = useQuery({
    queryKey: staffKeys.matches(userId, publicGroundId),
    queryFn: () => fetchGroundMatches(publicGroundId),
    enabled: Boolean(publicGroundId) && canView,
    staleTime: 1000 * 30,
    retry: false,
  })

  const matches = useMemo(() => query.data ?? [], [query.data])
  const upcoming = useMemo(
    () =>
      matches
        .filter((m) => m.status === 'upcoming')
        .sort((a, b) => new Date(a.matchDate).getTime() - new Date(b.matchDate).getTime()),
    [matches],
  )

  return {
    canView,
    membershipStatus,
    publicGroundId,
    groundName: activeMembership?.groundName ?? null,
    matches,
    upcoming,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
    isRefetching: query.isRefetching,
  }
}

export function useStaffMatch(matchId) {
  const { matches, ...rest } = useStaffMatches()
  const id = Number(matchId)
  const match = Number.isInteger(id) ? matches.find((m) => m.id === id) ?? null : null
  return { ...rest, match }
}
