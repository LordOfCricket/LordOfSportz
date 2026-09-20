import { useEffect, useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  fetchCanteenOrders,
  fetchCanteenOrder,
  updateCanteenOrderStatus,
} from '../services/groundOwnerApi'
import { useAuthStore } from '../store/authStore'
import { useStaffCanteenStore } from '../store/staffCanteenStore'
import { useGroundDetail } from './useGrounds'
import { useStaffScope, staffKeys } from './useStaffMemberships'
import { CANTEEN_ROLES } from '../utils/staffPermissions'

// Canteen operations have no dedicated permission key — the backend gates
// GET/PATCH order routes on role membership (GROUND_OWNER / GROUND_ADMIN /
// CANTEEN_STAFF). Mirror that: role is the client-side gate, backend
// re-authorizes every call.
export function canAccessCanteen(membership) {
  return CANTEEN_ROLES.includes(membership?.role)
}

// Resolves the active staff ground + its canteen list + a reconciled
// selected canteen. Falls back to the first canteen when the persisted id
// no longer belongs to the current ground.
export function useStaffCanteenScope() {
  const { activeMembership, publicGroundId, membershipStatus } = useStaffScope()
  const canAccess = canAccessCanteen(activeMembership)

  const groundDetail = useGroundDetail(publicGroundId ?? '')
  const canteens = useMemo(() => groundDetail.data?.canteens ?? [], [groundDetail.data])

  const selectedCanteenId = useStaffCanteenStore((s) => s.selectedCanteenId)
  const hydrated = useStaffCanteenStore((s) => s.hydrated)
  const setSelectedStaffCanteen = useStaffCanteenStore((s) => s.setSelectedStaffCanteen)

  const activeCanteen = useMemo(() => {
    if (canteens.length === 0) return null
    return canteens.find((c) => c.publicCanteenId === selectedCanteenId) ?? canteens[0]
  }, [canteens, selectedCanteenId])

  useEffect(() => {
    if (!hydrated || !activeCanteen) return
    if (activeCanteen.publicCanteenId !== selectedCanteenId) {
      setSelectedStaffCanteen(activeCanteen.publicCanteenId)
    }
  }, [hydrated, activeCanteen, selectedCanteenId, setSelectedStaffCanteen])

  return {
    canAccess,
    membershipStatus,
    publicGroundId,
    groundName: groundDetail.data?.name ?? activeMembership?.groundName ?? null,
    canteens,
    canteenCount: canteens.length,
    activeCanteen,
    setSelectedStaffCanteen,
    groundError: groundDetail.isError,
    groundLoading: groundDetail.isLoading,
    refetchGround: groundDetail.refetch,
  }
}

export function useStaffCanteenOrders(activeOnly) {
  const userId = useAuthStore((s) => s.user?.id)
  const { canAccess, publicGroundId, activeCanteen } = useStaffCanteenScope()
  const publicCanteenId = activeCanteen?.publicCanteenId

  const query = useQuery({
    queryKey: [
      ...staffKeys.canteenOrders(userId, publicGroundId, publicCanteenId),
      activeOnly ? 'active' : 'all',
    ],
    queryFn: () => fetchCanteenOrders(publicGroundId, publicCanteenId, { activeOnly, page: 1, limit: 50 }),
    enabled: canAccess && Boolean(publicGroundId) && Boolean(publicCanteenId),
    staleTime: 1000 * 15,
    retry: false,
  })

  return {
    canAccess,
    orders: query.data?.orders ?? [],
    total: query.data?.total ?? 0,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  }
}

export function useStaffCanteenOrder(orderId) {
  const userId = useAuthStore((s) => s.user?.id)
  const { canAccess, publicGroundId, groundName, activeCanteen } = useStaffCanteenScope()
  const publicCanteenId = activeCanteen?.publicCanteenId

  const query = useQuery({
    queryKey: staffKeys.canteenOrder(userId, publicGroundId, publicCanteenId, orderId),
    queryFn: () => fetchCanteenOrder(publicGroundId, publicCanteenId, orderId),
    enabled: canAccess && Boolean(publicGroundId) && Boolean(publicCanteenId) && Boolean(orderId),
    staleTime: 1000 * 15,
    retry: false,
  })

  return {
    canAccess,
    order: query.data ?? null,
    groundName,
    canteenName: activeCanteen?.name ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  }
}

export function useUpdateStaffOrderStatus() {
  const userId = useAuthStore((s) => s.user?.id)
  const queryClient = useQueryClient()
  const { publicGroundId, activeCanteen } = useStaffCanteenScope()
  const publicCanteenId = activeCanteen?.publicCanteenId

  return useMutation({
    mutationFn: ({ orderId, status }) =>
      updateCanteenOrderStatus(publicGroundId, publicCanteenId, orderId, status),
    onSuccess: (_data, { orderId }) => {
      queryClient.invalidateQueries({
        queryKey: staffKeys.canteenOrders(userId, publicGroundId, publicCanteenId),
      })
      queryClient.invalidateQueries({
        queryKey: staffKeys.canteenOrder(userId, publicGroundId, publicCanteenId, orderId),
      })
    },
  })
}
