import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import {
  fetchMerchandise,
  fetchMerchandiseItem,
  createMerchandise,
  updateMerchandise,
  deleteMerchandise,
} from '../services/adminApi'
import { useAuthStore } from '../store/authStore'
import { adminKeys } from './adminKeys'

const PAGE_SIZE = 20

export function useAdminMerchandise(filters = {}) {
  const userId = useAuthStore((s) => s.user?.id)
  const isSuperAdmin = useAuthStore((s) => s.isSuperAdmin)

  return useQuery({
    queryKey: adminKeys.merchandise(userId, filters),
    queryFn: () => fetchMerchandise({ ...filters, pageSize: PAGE_SIZE }),
    enabled: Boolean(userId) && isSuperAdmin,
    placeholderData: keepPreviousData,
    staleTime: 1000 * 30,
    retry: false,
  })
}

export function useAdminMerchandiseItem(id) {
  const userId = useAuthStore((s) => s.user?.id)
  const isSuperAdmin = useAuthStore((s) => s.isSuperAdmin)

  return useQuery({
    queryKey: adminKeys.merchandiseItem(userId, id),
    queryFn: () => fetchMerchandiseItem(id),
    enabled: Boolean(userId) && isSuperAdmin && Boolean(id),
    staleTime: 1000 * 15,
    retry: false,
  })
}

function useMerchandiseMutation(mutationFn) {
  const userId = useAuthStore((s) => s.user?.id)
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn,
    onSettled: (_data, _err, vars) => {
      queryClient.invalidateQueries({ queryKey: ['admin', userId ?? 'anon', 'merchandise'] })
      if (vars?.id) {
        queryClient.invalidateQueries({ queryKey: adminKeys.merchandiseItem(userId, vars.id) })
      }
    },
  })
}

export function useCreateMerchandise() {
  return useMerchandiseMutation(({ fields, image }) => createMerchandise(fields, image))
}

export function useUpdateMerchandise() {
  return useMerchandiseMutation(({ id, fields, image }) => updateMerchandise(id, fields, image))
}

export function useDeleteMerchandise() {
  return useMerchandiseMutation(({ id }) => deleteMerchandise(id))
}
