import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchGroundMatches, fetchGroundBookings, fetchCanteenOrders } from '../services/groundOwnerApi'
import { useAuthStore } from '../store/authStore'
import { useGroundDetail } from './useGrounds'
import { useNotifications } from './useNotifications'
import { useActiveStaffGround, staffKeys } from './useStaffMemberships'
import { hasStaffPermission, isGroundAdmin, isCanteenStaff } from '../utils/staffPermissions'
import { isMfaRequiredError } from '../utils/errors'
import { groundTodayDateStr } from '../utils/groundTime'

const UPCOMING_LIMIT = 3
const ORDER_PREVIEW_LIMIT = 4

// Composes the staff dashboard from existing authorized endpoints — there is
// no /staff/dashboard route. Every section query is default-deny: enabled
// only when the active membership actually holds the permission (or, for
// canteen, the role plus a real canteen on the ground).
export function useStaffDashboard() {
  const userId = useAuthStore((s) => s.user?.id)
  const {
    memberships,
    activeMembership,
    isLoading: membershipsLoading,
    isError: membershipsError,
    error: membershipsErr,
    refetch: refetchMemberships,
    isRefetching: membershipsRefetching,
  } = useActiveStaffGround()

  const publicGroundId = activeMembership?.publicGroundId
  const canViewMatches = hasStaffPermission(activeMembership, 'MATCH_VIEW')
  const canViewBookings =
    hasStaffPermission(activeMembership, 'BOOKING_VIEW') || hasStaffPermission(activeMembership, 'BOOKING_MANAGE')
  const canCanteen = isGroundAdmin(activeMembership) || isCanteenStaff(activeMembership)

  const groundDetail = useGroundDetail(publicGroundId ?? '')
  const canteens = useMemo(() => groundDetail.data?.canteens ?? [], [groundDetail.data])
  const canteen = canCanteen && canteens.length === 1 ? canteens[0] : null

  const matchesQuery = useQuery({
    queryKey: staffKeys.matches(userId, publicGroundId),
    queryFn: () => fetchGroundMatches(publicGroundId),
    enabled: Boolean(publicGroundId) && canViewMatches,
    staleTime: 1000 * 30,
    retry: false,
  })

  const bookingsQuery = useQuery({
    queryKey: staffKeys.bookings(userId, publicGroundId),
    queryFn: () => fetchGroundBookings(publicGroundId, { status: 'CONFIRMED', fromDate: groundTodayDateStr() }),
    enabled: Boolean(publicGroundId) && canViewBookings,
    staleTime: 1000 * 30,
    retry: false,
  })

  const canteenOrdersQuery = useQuery({
    queryKey: staffKeys.canteenOrders(userId, publicGroundId, canteen?.publicCanteenId),
    queryFn: () =>
      fetchCanteenOrders(publicGroundId, canteen.publicCanteenId, { activeOnly: true, page: 1, limit: 20 }),
    enabled: Boolean(publicGroundId) && Boolean(canteen),
    staleTime: 1000 * 15,
    retry: false,
  })

  const notificationsQuery = useNotifications(5, 0, Boolean(userId))

  const upcomingMatches = useMemo(() => {
    const rows = matchesQuery.data ?? []
    return rows
      .filter((m) => m.status === 'upcoming')
      .sort((a, b) => new Date(a.matchDate).getTime() - new Date(b.matchDate).getTime())
      .slice(0, UPCOMING_LIMIT)
  }, [matchesQuery.data])

  const upcomingBookings = useMemo(() => {
    const rows = bookingsQuery.data ?? []
    return rows
      .filter((b) => b.bookingType === 'CUSTOMER' && b.status === 'CONFIRMED')
      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
      .slice(0, UPCOMING_LIMIT)
  }, [bookingsQuery.data])

  const activeOrders = useMemo(
    () => (canteenOrdersQuery.data?.orders ?? []).slice(0, ORDER_PREVIEW_LIMIT),
    [canteenOrdersQuery.data],
  )

  let status = 'ready'
  if (membershipsLoading) status = 'loading'
  else if (membershipsError && isMfaRequiredError(membershipsErr)) status = 'mfa'
  // A failed background refresh with a cached membership still renders the
  // dashboard from last-known-good data; only hard-fail when nothing is cached.
  else if (membershipsError && !activeMembership) status = 'error'
  else if (memberships.length === 0 || !activeMembership) status = 'no-access'

  const sections = {
    matches: canViewMatches
      ? {
          isLoading: matchesQuery.isLoading,
          isError: matchesQuery.isError,
          items: upcomingMatches,
          totalUpcoming: (matchesQuery.data ?? []).filter((m) => m.status === 'upcoming').length,
          refetch: matchesQuery.refetch,
        }
      : null,
    bookings: canViewBookings
      ? {
          isLoading: bookingsQuery.isLoading,
          isError: bookingsQuery.isError,
          items: upcomingBookings,
          totalUpcoming: (bookingsQuery.data ?? []).filter(
            (b) => b.bookingType === 'CUSTOMER' && b.status === 'CONFIRMED',
          ).length,
          refetch: bookingsQuery.refetch,
        }
      : null,
    canteen: canCanteen && canteens.length > 0
      ? {
          canteenCount: canteens.length,
          canteenName: canteen?.name ?? null,
          isLoading: canteen ? canteenOrdersQuery.isLoading : false,
          isError: canteen ? canteenOrdersQuery.isError : false,
          activeCount: canteen ? canteenOrdersQuery.data?.total ?? 0 : null,
          orders: activeOrders,
          refetch: canteenOrdersQuery.refetch,
        }
      : null,
    notifications: {
      isLoading: notificationsQuery.isLoading,
      isError: notificationsQuery.isError,
      unreadCount: notificationsQuery.data?.unreadCount ?? 0,
      items: (notificationsQuery.data?.notifications ?? []).slice(0, 3),
      refetch: notificationsQuery.refetch,
    },
  }

  const anySectionVisible = Boolean(sections.matches || sections.bookings || sections.canteen)

  const refetch = () => {
    const jobs = [refetchMemberships(), groundDetail.refetch(), notificationsQuery.refetch()]
    if (sections.matches) jobs.push(matchesQuery.refetch())
    if (sections.bookings) jobs.push(bookingsQuery.refetch())
    if (sections.canteen && canteen) jobs.push(canteenOrdersQuery.refetch())
    return Promise.all(jobs)
  }

  return {
    status,
    error: membershipsErr,
    refetch,
    isRefetching: membershipsRefetching,
    membershipCount: memberships.length,
    membership: activeMembership,
    ground: {
      name: groundDetail.data?.name ?? activeMembership?.groundName ?? null,
      city: groundDetail.data?.city ?? null,
      state: groundDetail.data?.state ?? null,
    },
    sections,
    anySectionVisible,
  }
}
