import { useQuery } from '@tanstack/react-query'
import { fetchDashboardStats } from '../services/adminApi'
import { useAuthStore } from '../store/authStore'
import { adminKeys } from './adminKeys'

// Platform overview from GET /admin/dashboard/stats. Platform-wide — keyed by
// the acting Super Admin only, no ground/canteen scope. retry:false so a
// forbidden response surfaces once instead of hammering the endpoint.
export function useAdminDashboard() {
  const userId = useAuthStore((s) => s.user?.id)
  const isSuperAdmin = useAuthStore((s) => s.isSuperAdmin)

  return useQuery({
    queryKey: adminKeys.dashboard(userId),
    queryFn: fetchDashboardStats,
    enabled: Boolean(userId) && isSuperAdmin,
    staleTime: 1000 * 60,
    retry: false,
  })
}
