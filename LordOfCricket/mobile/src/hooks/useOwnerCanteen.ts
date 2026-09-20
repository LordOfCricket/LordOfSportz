import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as groundOwnerApi from '../services/groundOwnerApi'
import { useAuthStore } from '../store/authStore'
import { useGroundDetail } from './useGrounds'
import { groundOwnerKeys } from './useMyGrounds'
import { CanteenMenuItemInput, CanteenOrderStatus, CanteenTodayMenuEntryInput } from '../types'

// The canteen list is part of the public ground profile — no dedicated
// endpoint. Everything else is scoped by both public ids and stays disabled
// until they are resolved. Backend GROUND_OWNER checks remain the boundary.

export function useOwnerCanteens(publicGroundId: string | undefined) {
  const detail = useGroundDetail(publicGroundId ?? '')
  const canteens = useMemo(() => detail.data?.canteens ?? [], [detail.data])
  return { ...detail, canteens }
}

export function useOwnerCanteen(publicGroundId: string | undefined, publicCanteenId: string | undefined) {
  const { canteens, ...rest } = useOwnerCanteens(publicGroundId)
  const canteen = publicCanteenId ? canteens.find((c) => c.publicCanteenId === publicCanteenId) ?? null : null
  return { ...rest, canteens, canteen }
}

export function useCanteenMenu(publicGroundId: string | undefined, publicCanteenId: string | undefined) {
  return useQuery({
    queryKey: groundOwnerKeys.canteenMenu(publicGroundId ?? 'none', publicCanteenId ?? 'none'),
    queryFn: () => groundOwnerApi.fetchCanteenMenu(publicGroundId as string, publicCanteenId as string),
    enabled: Boolean(publicGroundId) && Boolean(publicCanteenId),
    staleTime: 1000 * 30,
  })
}

export function useCanteenTodayMenu(publicGroundId: string | undefined, publicCanteenId: string | undefined) {
  return useQuery({
    queryKey: groundOwnerKeys.canteenTodayMenu(publicGroundId ?? 'none', publicCanteenId ?? 'none'),
    queryFn: () => groundOwnerApi.fetchCanteenTodayMenu(publicGroundId as string, publicCanteenId as string),
    enabled: Boolean(publicGroundId) && Boolean(publicCanteenId),
    staleTime: 1000 * 30,
  })
}

export function useCanteenOrders(
  publicGroundId: string | undefined,
  publicCanteenId: string | undefined,
  opts: { page?: number; limit?: number; activeOnly?: boolean } = {},
) {
  const filters = { page: opts.page ?? 1, limit: opts.limit ?? 20, activeOnly: Boolean(opts.activeOnly) }
  return useQuery({
    queryKey: groundOwnerKeys.canteenOrders(publicGroundId ?? 'none', publicCanteenId ?? 'none', filters),
    queryFn: () => groundOwnerApi.fetchCanteenOrders(publicGroundId as string, publicCanteenId as string, opts),
    enabled: Boolean(publicGroundId) && Boolean(publicCanteenId),
    staleTime: 1000 * 15,
  })
}

export function useCanteenOrder(
  publicGroundId: string | undefined,
  publicCanteenId: string | undefined,
  orderId: string | undefined,
) {
  return useQuery({
    queryKey: groundOwnerKeys.canteenOrder(publicGroundId ?? 'none', publicCanteenId ?? 'none', orderId ?? 'none'),
    queryFn: () => groundOwnerApi.fetchCanteenOrder(publicGroundId as string, publicCanteenId as string, orderId as string),
    enabled: Boolean(publicGroundId) && Boolean(publicCanteenId) && Boolean(orderId),
    staleTime: 1000 * 15,
    retry: false,
  })
}

function useCanteenMenuInvalidation(publicGroundId: string, publicCanteenId: string) {
  const queryClient = useQueryClient()
  return () => {
    queryClient.invalidateQueries({ queryKey: groundOwnerKeys.canteenMenu(publicGroundId, publicCanteenId) })
    queryClient.invalidateQueries({ queryKey: groundOwnerKeys.canteenTodayMenu(publicGroundId, publicCanteenId) })
  }
}

export function useCreateCanteenMenuItem(publicGroundId: string, publicCanteenId: string) {
  const invalidate = useCanteenMenuInvalidation(publicGroundId, publicCanteenId)
  return useMutation({
    mutationFn: (input: CanteenMenuItemInput) =>
      groundOwnerApi.createCanteenMenuItem(publicGroundId, publicCanteenId, input),
    onSuccess: invalidate,
  })
}

export function useUpdateCanteenMenuItem(publicGroundId: string, publicCanteenId: string) {
  const invalidate = useCanteenMenuInvalidation(publicGroundId, publicCanteenId)
  return useMutation({
    mutationFn: (args: { id: string; input: Partial<CanteenMenuItemInput> }) =>
      groundOwnerApi.updateCanteenMenuItem(publicGroundId, publicCanteenId, args.id, args.input),
    onSuccess: invalidate,
  })
}

export function useDeleteCanteenMenuItem(publicGroundId: string, publicCanteenId: string) {
  const invalidate = useCanteenMenuInvalidation(publicGroundId, publicCanteenId)
  return useMutation({
    mutationFn: (id: string) => groundOwnerApi.deleteCanteenMenuItem(publicGroundId, publicCanteenId, id),
    onSuccess: invalidate,
  })
}

export function useSaveCanteenTodayMenu(publicGroundId: string, publicCanteenId: string) {
  const queryClient = useQueryClient()
  const userId = useAuthStore((s) => s.user?.id) ?? 'anon'
  return useMutation({
    mutationFn: (items: CanteenTodayMenuEntryInput[]) =>
      groundOwnerApi.saveCanteenTodayMenu(publicGroundId, publicCanteenId, items),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: groundOwnerKeys.canteenTodayMenu(publicGroundId, publicCanteenId) })
      queryClient.invalidateQueries({ queryKey: groundOwnerKeys.dashboard(userId, publicGroundId) })
    },
  })
}

export function useUpdateCanteenOrderStatus(publicGroundId: string, publicCanteenId: string) {
  const queryClient = useQueryClient()
  const userId = useAuthStore((s) => s.user?.id) ?? 'anon'
  return useMutation({
    mutationFn: (args: { orderId: string; status: CanteenOrderStatus }) =>
      groundOwnerApi.updateCanteenOrderStatus(publicGroundId, publicCanteenId, args.orderId, args.status),
    onSuccess: (_data, args) => {
      queryClient.invalidateQueries({ queryKey: groundOwnerKeys.canteenOrdersRoot(publicGroundId, publicCanteenId) })
      queryClient.invalidateQueries({ queryKey: groundOwnerKeys.canteenOrder(publicGroundId, publicCanteenId, args.orderId) })
      queryClient.invalidateQueries({ queryKey: groundOwnerKeys.dashboard(userId, publicGroundId) })
    },
  })
}

export function useUpdateCanteenActivation(publicGroundId: string, publicCanteenId: string) {
  const queryClient = useQueryClient()
  const userId = useAuthStore((s) => s.user?.id) ?? 'anon'
  return useMutation({
    mutationFn: (isActive: boolean) => groundOwnerApi.updateCanteenActivation(publicGroundId, publicCanteenId, isActive),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['grounds', publicGroundId] })
      queryClient.invalidateQueries({ queryKey: groundOwnerKeys.dashboard(userId, publicGroundId) })
    },
  })
}
