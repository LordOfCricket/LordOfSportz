import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchAmenityCatalog, createAmenity, updateAmenity, deleteAmenity } from '../services/adminApi'
import { useAuthStore } from '../store/authStore'
import { adminKeys } from './adminKeys'

export function useAdminAmenityCatalog() {
  const userId = useAuthStore((s) => s.user?.id)
  const isSuperAdmin = useAuthStore((s) => s.isSuperAdmin)

  return useQuery({
    queryKey: adminKeys.amenityCatalog(userId),
    queryFn: fetchAmenityCatalog,
    enabled: Boolean(userId) && isSuperAdmin,
    staleTime: 1000 * 60,
    retry: false,
  })
}

function useAmenityMutation(mutationFn) {
  const userId = useAuthStore((s) => s.user?.id)
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn,
    onSettled: () => queryClient.invalidateQueries({ queryKey: adminKeys.amenityCatalog(userId) }),
  })
}

export function useCreateAmenity() {
  return useAmenityMutation((input) => createAmenity(input))
}

export function useUpdateAmenity() {
  return useAmenityMutation(({ key, fields }) => updateAmenity(key, fields))
}

export function useDeleteAmenity() {
  return useAmenityMutation(({ key }) => deleteAmenity(key))
}
