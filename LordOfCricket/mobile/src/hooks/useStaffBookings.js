import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchGroundBookings, fetchGroundBooking } from '../services/groundOwnerApi'
import { useAuthStore } from '../store/authStore'
import { useStaffScope, staffKeys } from './useStaffMemberships'
import { hasStaffPermission } from '../utils/staffPermissions'
import { groundTodayDateStr } from '../utils/groundTime'

// Read-only. Same endpoints the owner uses (GET .../bookings and
// .../bookings/:id, requireGroundPermission BOOKING_VIEW|BOOKING_MANAGE) —
// gated on the active membership's grant. BOOKING_MANAGE grants no extra
// action here: there is no staff-reachable booking mutation.
function canViewBookings(membership) {
  return hasStaffPermission(membership, 'BOOKING_VIEW') || hasStaffPermission(membership, 'BOOKING_MANAGE')
}

export function useStaffBookings() {
  const userId = useAuthStore((s) => s.user?.id)
  const { activeMembership, publicGroundId, membershipStatus } = useStaffScope()
  const canView = canViewBookings(activeMembership)

  const query = useQuery({
    queryKey: staffKeys.bookings(userId, publicGroundId),
    queryFn: () => fetchGroundBookings(publicGroundId, { status: 'CONFIRMED', fromDate: groundTodayDateStr() }),
    enabled: Boolean(publicGroundId) && canView,
    staleTime: 1000 * 30,
    retry: false,
  })

  const upcoming = useMemo(
    () =>
      (query.data ?? [])
        .filter((b) => b.bookingType === 'CUSTOMER' && b.status === 'CONFIRMED')
        .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()),
    [query.data],
  )

  return {
    canView,
    membershipStatus,
    publicGroundId,
    groundName: activeMembership?.groundName ?? null,
    upcoming,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
    isRefetching: query.isRefetching,
  }
}

export function useStaffBooking(publicBookingId) {
  const userId = useAuthStore((s) => s.user?.id)
  const { activeMembership, publicGroundId, membershipStatus } = useStaffScope()
  const canView = canViewBookings(activeMembership)

  const query = useQuery({
    queryKey: [...staffKeys.bookings(userId, publicGroundId), 'detail', publicBookingId ?? 'none'],
    queryFn: () => fetchGroundBooking(publicGroundId, publicBookingId),
    enabled: Boolean(publicGroundId) && Boolean(publicBookingId) && canView,
    staleTime: 1000 * 30,
    retry: false,
  })

  return {
    canView,
    membershipStatus,
    groundName: activeMembership?.groundName ?? null,
    booking: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
    isRefetching: query.isRefetching,
  }
}

export { canViewBookings }
