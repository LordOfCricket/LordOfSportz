import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchSponsors, createSponsor, updateSponsor, deleteSponsor } from '../services/adminApi'
import { useAuthStore } from '../store/authStore'
import { adminKeys } from './adminKeys'

export function useAdminSponsors() {
  const userId = useAuthStore((s) => s.user?.id)
  const isSuperAdmin = useAuthStore((s) => s.isSuperAdmin)

  return useQuery({
    queryKey: adminKeys.sponsors(userId),
    queryFn: fetchSponsors,
    enabled: Boolean(userId) && isSuperAdmin,
    staleTime: 1000 * 60,
    retry: false,
  })
}

function useSponsorMutation(mutationFn) {
  const userId = useAuthStore((s) => s.user?.id)
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn,
    onSettled: () => queryClient.invalidateQueries({ queryKey: adminKeys.sponsors(userId) }),
  })
}

export function useCreateSponsor() {
  return useSponsorMutation(({ fields, logo }) => createSponsor(fields, logo))
}

export function useUpdateSponsor() {
  return useSponsorMutation(({ id, fields, logo }) => updateSponsor(id, fields, logo))
}

export function useDeleteSponsor() {
  return useSponsorMutation(({ id }) => deleteSponsor(id))
}
