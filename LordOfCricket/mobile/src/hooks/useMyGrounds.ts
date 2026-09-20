import { useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import * as groundOwnerApi from '../services/groundOwnerApi'
import { useAuthStore } from '../store/authStore'
import { useSelectedGroundStore } from '../store/selectedGroundStore'

export const groundOwnerKeys = {
  all: ['ground-owner'] as const,
  grounds: (userId: number | string) => [...groundOwnerKeys.all, userId, 'grounds'] as const,
  dashboard: (userId: number | string, publicGroundId: string) =>
    [...groundOwnerKeys.all, userId, 'dashboard', publicGroundId] as const,
  media: (publicGroundId: string) => [...groundOwnerKeys.all, 'media', publicGroundId] as const,
  amenities: (publicGroundId: string) => [...groundOwnerKeys.all, 'amenities', publicGroundId] as const,
  amenityCatalog: () => [...groundOwnerKeys.all, 'amenity-catalog'] as const,
  pricing: (publicGroundId: string) => [...groundOwnerKeys.all, 'pricing', publicGroundId] as const,
  bookings: (publicGroundId: string, filters: Record<string, string | null>) =>
    [...groundOwnerKeys.all, 'bookings', publicGroundId, filters] as const,
  bookingsRoot: (publicGroundId: string) => [...groundOwnerKeys.all, 'bookings', publicGroundId] as const,
  booking: (publicGroundId: string, publicBookingId: string) =>
    [...groundOwnerKeys.all, 'booking', publicGroundId, publicBookingId] as const,
  bookingAvailability: (publicGroundId: string, date: string) =>
    [...groundOwnerKeys.all, 'booking-availability', publicGroundId, date] as const,
  bookingAvailabilityRoot: (publicGroundId: string) =>
    [...groundOwnerKeys.all, 'booking-availability', publicGroundId] as const,
  matches: (publicGroundId: string) => [...groundOwnerKeys.all, 'matches', publicGroundId] as const,
  matchUmpireSlots: (publicGroundId: string, matchId: number) =>
    [...groundOwnerKeys.all, 'match-slots', publicGroundId, matchId] as const,
  matchProposals: (publicGroundId: string, matchId: number) =>
    [...groundOwnerKeys.all, 'match-proposals', publicGroundId, matchId] as const,
  matchHistory: (publicGroundId: string, matchId: number) =>
    [...groundOwnerKeys.all, 'match-history', publicGroundId, matchId] as const,
  matchIncidents: (publicGroundId: string, matchId: number) =>
    [...groundOwnerKeys.all, 'match-incidents', publicGroundId, matchId] as const,
  recommendedUmpires: (publicGroundId: string, matchId: number) =>
    [...groundOwnerKeys.all, 'recommended-umpires', publicGroundId, matchId] as const,
  umpireOpsSummary: (publicGroundId: string) =>
    [...groundOwnerKeys.all, 'umpire-ops-summary', publicGroundId] as const,
  eligibleReplacements: (publicGroundId: string, matchId: number, slotId: number) =>
    [...groundOwnerKeys.all, 'eligible-replacements', publicGroundId, matchId, slotId] as const,
  topUmpires: (limit: number, offset: number) => [...groundOwnerKeys.all, 'top-umpires', limit, offset] as const,
  canteenMenu: (publicGroundId: string, publicCanteenId: string) =>
    [...groundOwnerKeys.all, 'canteen-menu', publicGroundId, publicCanteenId] as const,
  canteenTodayMenu: (publicGroundId: string, publicCanteenId: string) =>
    [...groundOwnerKeys.all, 'canteen-today', publicGroundId, publicCanteenId] as const,
  canteenOrders: (publicGroundId: string, publicCanteenId: string, filters: Record<string, string | number | boolean>) =>
    [...groundOwnerKeys.all, 'canteen-orders', publicGroundId, publicCanteenId, filters] as const,
  canteenOrdersRoot: (publicGroundId: string, publicCanteenId: string) =>
    [...groundOwnerKeys.all, 'canteen-orders', publicGroundId, publicCanteenId] as const,
  canteenOrder: (publicGroundId: string, publicCanteenId: string, orderId: string) =>
    [...groundOwnerKeys.all, 'canteen-order', publicGroundId, publicCanteenId, orderId] as const,
  staff: (publicGroundId: string) => [...groundOwnerKeys.all, 'staff', publicGroundId] as const,
  permissionCatalog: () => [...groundOwnerKeys.all, 'permission-catalog'] as const,
  analytics: (publicGroundId: string, range: string) =>
    [...groundOwnerKeys.all, 'analytics', publicGroundId, range] as const,
  analyticsTrends: (publicGroundId: string, range: string) =>
    [...groundOwnerKeys.all, 'analytics-trends', publicGroundId, range] as const,
  reviews: (publicGroundId: string, limit: number) =>
    [...groundOwnerKeys.all, 'reviews', publicGroundId, limit] as const,
  notifications: (publicGroundId: string, limit: number) =>
    [...groundOwnerKeys.all, 'notifications', publicGroundId, limit] as const,
  notificationsRoot: (publicGroundId: string) =>
    [...groundOwnerKeys.all, 'notifications', publicGroundId] as const,
}

export function useMyGrounds() {
  const userId = useAuthStore((s) => s.user?.id)
  const isGroundOwner = useAuthStore((s) => s.isGroundOwner)
  return useQuery({
    queryKey: groundOwnerKeys.grounds(userId ?? 'anon'),
    queryFn: groundOwnerApi.fetchMyGrounds,
    enabled: Boolean(userId) && isGroundOwner,
    staleTime: 1000 * 60 * 2,
  })
}

/**
 * The one place selection state and the live grounds list are reconciled.
 * Reusable by every later owner module (bookings, matches, canteen, …): it
 * always resolves a concrete ground, falls back to the first when the
 * persisted choice is gone, and writes the resolved id back so the two stay
 * in sync.
 */
export function useActiveGround() {
  const groundsQuery = useMyGrounds()
  const grounds = useMemo(() => groundsQuery.data ?? [], [groundsQuery.data])

  const selectedGroundId = useSelectedGroundStore((s) => s.selectedGroundId)
  const hydrated = useSelectedGroundStore((s) => s.hydrated)
  const setSelectedGround = useSelectedGroundStore((s) => s.setSelectedGround)

  const activeGround = useMemo(() => {
    if (grounds.length === 0) return null
    return grounds.find((g) => g.publicGroundId === selectedGroundId) ?? grounds[0]
  }, [grounds, selectedGroundId])

  useEffect(() => {
    if (!hydrated || !activeGround) return
    if (activeGround.publicGroundId !== selectedGroundId) {
      setSelectedGround(activeGround.publicGroundId)
    }
  }, [hydrated, activeGround, selectedGroundId, setSelectedGround])

  return {
    grounds,
    activeGround,
    setSelectedGround,
    isLoading: groundsQuery.isLoading,
    isError: groundsQuery.isError,
    error: groundsQuery.error,
    refetch: groundsQuery.refetch,
    isRefetching: groundsQuery.isRefetching,
  }
}

export function useGroundOwnerDashboard(publicGroundId: string | undefined) {
  const userId = useAuthStore((s) => s.user?.id)
  return useQuery({
    queryKey: groundOwnerKeys.dashboard(userId ?? 'anon', publicGroundId ?? 'none'),
    queryFn: () => groundOwnerApi.fetchGroundDashboard(publicGroundId as string),
    enabled: Boolean(userId) && Boolean(publicGroundId),
    staleTime: 1000 * 60,
    retry: false,
  })
}
