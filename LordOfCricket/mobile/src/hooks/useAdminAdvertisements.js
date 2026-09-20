import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchAdvertisements, deleteAdvertisement } from '../services/adminApi'
import { useAuthStore } from '../store/authStore'
import { adminKeys } from './adminKeys'

export function useAdminAdvertisements() {
  const userId = useAuthStore((s) => s.user?.id)
  const isSuperAdmin = useAuthStore((s) => s.isSuperAdmin)

  return useQuery({
    queryKey: adminKeys.advertisements(userId),
    queryFn: fetchAdvertisements,
    enabled: Boolean(userId) && isSuperAdmin,
    staleTime: 1000 * 60,
    retry: false,
  })
}

export function useDeleteAdvertisement() {
  const userId = useAuthStore((s) => s.user?.id)
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id }) => deleteAdvertisement(id),
    onSettled: () => queryClient.invalidateQueries({ queryKey: adminKeys.advertisements(userId) }),
  })
}
