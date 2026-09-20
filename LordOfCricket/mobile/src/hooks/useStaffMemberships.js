import { useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchMyStaffMemberships } from '../services/staffApi'
import { useAuthStore } from '../store/authStore'
import { useStaffGroundStore } from '../store/staffGroundStore'

export const staffKeys = {
  all: ['staff'],
  memberships: (userId) => ['staff', userId ?? 'anon', 'memberships'],
  matches: (userId, publicGroundId) => ['staff', userId ?? 'anon', 'matches', publicGroundId ?? 'none'],
  bookings: (userId, publicGroundId) => ['staff', userId ?? 'anon', 'bookings', publicGroundId ?? 'none'],
  canteenOrders: (userId, publicGroundId, publicCanteenId) => [
    'staff',
    userId ?? 'anon',
    'canteen-orders',
    publicGroundId ?? 'none',
    publicCanteenId ?? 'none',
  ],
  canteenOrder: (userId, publicGroundId, publicCanteenId, orderId) => [
    'staff',
    userId ?? 'anon',
    'canteen-order',
    publicGroundId ?? 'none',
    publicCanteenId ?? 'none',
    orderId ?? 'none',
  ],
}

export function useStaffMemberships() {
  const userId = useAuthStore((s) => s.user?.id)
  const isStaff = useAuthStore((s) => s.isStaff)
  return useQuery({
    queryKey: staffKeys.memberships(userId),
    queryFn: fetchMyStaffMemberships,
    enabled: Boolean(userId) && isStaff,
    staleTime: 1000 * 60 * 2,
    // Re-validate role + permissions from the server every time a guarded
    // screen mounts. Cached memberships still render immediately (no spinner
    // flash); a revoked membership or dropped permission takes effect as soon
    // as the refetch settles — the guard then redirects.
    refetchOnMount: 'always',
    // Never retry a forbidden / 4xx response for the only staff-identity call.
    retry: false,
  })
}

// Resolves a concrete membership from the persisted selection, falling back
// to the first active membership when the stored ground is missing or no
// longer authorized, and writes the resolved id back so the two stay in
// sync. Same shape as the Ground Owner useActiveGround.
export function useActiveStaffGround() {
  const membershipsQuery = useStaffMemberships()
  const memberships = useMemo(() => membershipsQuery.data ?? [], [membershipsQuery.data])

  const selectedGroundId = useStaffGroundStore((s) => s.selectedGroundId)
  const hydrated = useStaffGroundStore((s) => s.hydrated)
  const setSelectedStaffGround = useStaffGroundStore((s) => s.setSelectedStaffGround)

  const activeMembership = useMemo(() => {
    if (memberships.length === 0) return null
    return memberships.find((m) => m.publicGroundId === selectedGroundId) ?? memberships[0]
  }, [memberships, selectedGroundId])

  useEffect(() => {
    if (!hydrated || !activeMembership) return
    if (activeMembership.publicGroundId !== selectedGroundId) {
      setSelectedStaffGround(activeMembership.publicGroundId)
    }
  }, [hydrated, activeMembership, selectedGroundId, setSelectedStaffGround])

  return {
    memberships,
    activeMembership,
    setSelectedStaffGround,
    isLoading: membershipsQuery.isLoading,
    isError: membershipsQuery.isError,
    error: membershipsQuery.error,
    refetch: membershipsQuery.refetch,
    isRefetching: membershipsQuery.isRefetching,
  }
}

// Compact scope resolver shared by the operational hooks. `membershipStatus`
// is 'loading' | 'no-access' | 'error' | 'ok'.
export function useStaffScope() {
  const { memberships, activeMembership, isLoading, isError } = useActiveStaffGround()
  let membershipStatus = 'ok'
  if (isLoading) membershipStatus = 'loading'
  else if (isError) membershipStatus = 'error'
  else if (memberships.length === 0 || !activeMembership) membershipStatus = 'no-access'
  return {
    activeMembership,
    publicGroundId: activeMembership?.publicGroundId,
    membershipStatus,
  }
}
