import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as groundOwnerApi from '../services/groundOwnerApi'
import { useAuthStore } from '../store/authStore'
import { groundOwnerKeys } from './useMyGrounds'
import { CreateStaffInput } from '../types'

// Staff data is scoped to one ground via publicGroundId and stays disabled
// until useActiveGround resolves an id. There is no staff-detail endpoint —
// detail screens select the row from this list by membershipId.

export function useGroundStaff(publicGroundId: string | undefined) {
  return useQuery({
    queryKey: groundOwnerKeys.staff(publicGroundId ?? 'none'),
    queryFn: () => groundOwnerApi.fetchGroundStaff(publicGroundId as string),
    enabled: Boolean(publicGroundId),
    staleTime: 1000 * 30,
  })
}

export function useGroundStaffMember(publicGroundId: string | undefined, membershipId: number | undefined) {
  const query = useGroundStaff(publicGroundId)
  const member =
    membershipId != null ? (query.data ?? []).find((s) => s.membershipId === membershipId) ?? null : null
  return { ...query, member }
}

export function usePermissionCatalog() {
  return useQuery({
    queryKey: groundOwnerKeys.permissionCatalog(),
    queryFn: groundOwnerApi.fetchPermissionCatalog,
    staleTime: 1000 * 60 * 30,
  })
}

function useStaffInvalidation(publicGroundId: string) {
  const queryClient = useQueryClient()
  const userId = useAuthStore((s) => s.user?.id) ?? 'anon'
  return () => {
    queryClient.invalidateQueries({ queryKey: groundOwnerKeys.staff(publicGroundId) })
    queryClient.invalidateQueries({ queryKey: groundOwnerKeys.dashboard(userId, publicGroundId) })
  }
}

export function useCreateGroundStaff(publicGroundId: string) {
  const invalidate = useStaffInvalidation(publicGroundId)
  return useMutation({
    mutationFn: (input: CreateStaffInput) => groundOwnerApi.createGroundStaff(publicGroundId, input),
    onSuccess: invalidate,
  })
}

export function useGrantStaffPermission(publicGroundId: string) {
  const invalidate = useStaffInvalidation(publicGroundId)
  return useMutation({
    mutationFn: (args: { membershipId: number; permissionKey: string }) =>
      groundOwnerApi.grantStaffPermission(publicGroundId, args.membershipId, args.permissionKey),
    onSuccess: invalidate,
  })
}

export function useRevokeStaffPermission(publicGroundId: string) {
  const invalidate = useStaffInvalidation(publicGroundId)
  return useMutation({
    mutationFn: (args: { membershipId: number; permissionKey: string }) =>
      groundOwnerApi.revokeStaffPermission(publicGroundId, args.membershipId, args.permissionKey),
    onSuccess: invalidate,
  })
}

export function useDisableGroundStaff(publicGroundId: string) {
  const invalidate = useStaffInvalidation(publicGroundId)
  return useMutation({
    mutationFn: (membershipId: number) => groundOwnerApi.disableGroundStaff(publicGroundId, membershipId),
    onSuccess: invalidate,
  })
}
