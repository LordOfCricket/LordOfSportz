import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as groundOwnerApi from '../services/groundOwnerApi'
import { useAuthStore } from '../store/authStore'
import { groundOwnerKeys } from './useMyGrounds'
import { OwnerBookingFilters, StaffBlockInput } from '../types'

// All booking data is scoped to one ground via publicGroundId and stays
// disabled until useActiveGround resolves an id. Backend ownership checks
// remain the security boundary.

export function useGroundBookings(publicGroundId: string | undefined, filters: OwnerBookingFilters) {
  const status = filters.status === 'ALL' ? undefined : filters.status
  const keyFilters = { fromDate: filters.fromDate, toDate: filters.toDate, status: status ?? null }
  return useQuery({
    queryKey: groundOwnerKeys.bookings(publicGroundId ?? 'none', keyFilters),
    queryFn: () =>
      groundOwnerApi.fetchGroundBookings(publicGroundId as string, {
        fromDate: filters.fromDate,
        toDate: filters.toDate,
        status,
      }),
    enabled: Boolean(publicGroundId),
    staleTime: 1000 * 30,
  })
}

export function useGroundBooking(publicGroundId: string | undefined, publicBookingId: string | undefined) {
  return useQuery({
    queryKey: groundOwnerKeys.booking(publicGroundId ?? 'none', publicBookingId ?? 'none'),
    queryFn: () => groundOwnerApi.fetchGroundBooking(publicGroundId as string, publicBookingId as string),
    enabled: Boolean(publicGroundId) && Boolean(publicBookingId),
    staleTime: 1000 * 30,
    retry: false,
  })
}

export function useGroundBookingAvailability(publicGroundId: string | undefined, date: string | null) {
  return useQuery({
    queryKey: groundOwnerKeys.bookingAvailability(publicGroundId ?? 'none', date ?? 'none'),
    queryFn: () => groundOwnerApi.fetchGroundBookingAvailability(publicGroundId as string, date as string),
    enabled: Boolean(publicGroundId) && Boolean(date),
    staleTime: 1000 * 30,
    retry: false,
  })
}

function useBookingInvalidation(publicGroundId: string) {
  const queryClient = useQueryClient()
  const userId = useAuthStore((s) => s.user?.id) ?? 'anon'
  return () => {
    queryClient.invalidateQueries({ queryKey: groundOwnerKeys.bookingsRoot(publicGroundId) })
    queryClient.invalidateQueries({ queryKey: groundOwnerKeys.bookingAvailabilityRoot(publicGroundId) })
    queryClient.invalidateQueries({ queryKey: groundOwnerKeys.dashboard(userId, publicGroundId) })
  }
}

export function useCreateStaffBlock(publicGroundId: string) {
  const invalidate = useBookingInvalidation(publicGroundId)
  return useMutation({
    mutationFn: (input: StaffBlockInput) => groundOwnerApi.createGroundStaffBlock(publicGroundId, input),
    onSuccess: invalidate,
  })
}

export function useDeleteStaffBlock(publicGroundId: string) {
  const queryClient = useQueryClient()
  const invalidate = useBookingInvalidation(publicGroundId)
  return useMutation({
    mutationFn: (publicBlockId: string) => groundOwnerApi.deleteGroundStaffBlock(publicGroundId, publicBlockId),
    onSuccess: (_data, publicBlockId) => {
      invalidate()
      queryClient.invalidateQueries({ queryKey: groundOwnerKeys.booking(publicGroundId, publicBlockId) })
    },
  })
}
