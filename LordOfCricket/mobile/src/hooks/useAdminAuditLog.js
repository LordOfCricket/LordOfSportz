import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { fetchAuditLog } from '../services/adminApi'
import { useAuthStore } from '../store/authStore'
import { adminKeys } from './adminKeys'

// Server-side paginated, read-only. The query key carries page + eventType
// so pages and filters never share a cache entry. `placeholderData` keeps
// the previous page visible while the next one loads (no blank flash).
export function useAdminAuditLog({ page = 1, eventType = '' } = {}) {
  const userId = useAuthStore((s) => s.user?.id)
  const isSuperAdmin = useAuthStore((s) => s.isSuperAdmin)

  return useQuery({
    queryKey: adminKeys.auditLog(userId, { page, eventType }),
    queryFn: () => fetchAuditLog({ page, eventType }),
    enabled: Boolean(userId) && isSuperAdmin,
    placeholderData: keepPreviousData,
    staleTime: 1000 * 30,
    retry: false,
  })
}
