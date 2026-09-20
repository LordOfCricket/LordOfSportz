import { useQuery } from '@tanstack/react-query'
import { fetchOwners, fetchOwnerGrounds, fetchPlayers, fetchUmpires, fetchStaff } from '../services/adminApi'
import { useAuthStore } from '../store/authStore'
import { adminKeys } from './adminKeys'

// Platform-wide, read-only. Keyed by the acting Super Admin only — no
// ground/canteen/membership scope. 1-minute staleTime keeps navigation
// between directories from refetching constantly.
function useDirectoryQuery(queryKey, queryFn, extraEnabled = true) {
  const userId = useAuthStore((s) => s.user?.id)
  const isSuperAdmin = useAuthStore((s) => s.isSuperAdmin)

  return useQuery({
    queryKey,
    queryFn,
    enabled: Boolean(userId) && isSuperAdmin && extraEnabled,
    staleTime: 1000 * 60,
    retry: false,
  })
}

export function useAdminOwners() {
  const userId = useAuthStore((s) => s.user?.id)
  return useDirectoryQuery(adminKeys.owners(userId), fetchOwners)
}

export function useAdminOwnerGrounds(ownerUserId) {
  const userId = useAuthStore((s) => s.user?.id)
  return useDirectoryQuery(
    adminKeys.ownerGrounds(userId, ownerUserId),
    () => fetchOwnerGrounds(ownerUserId),
    Boolean(ownerUserId),
  )
}

export function useAdminPlayers() {
  const userId = useAuthStore((s) => s.user?.id)
  return useDirectoryQuery(adminKeys.players(userId), fetchPlayers)
}

export function useAdminUmpires() {
  const userId = useAuthStore((s) => s.user?.id)
  return useDirectoryQuery(adminKeys.umpires(userId), fetchUmpires)
}

export function useAdminStaff() {
  const userId = useAuthStore((s) => s.user?.id)
  return useDirectoryQuery(adminKeys.staff(userId), fetchStaff)
}
