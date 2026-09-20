import { useQuery } from '@tanstack/react-query'
import { globalSearch } from '../services/searchApi'

/** Minimum term length before a network request is made. */
export const MIN_QUERY_LENGTH = 2

export function useGlobalSearch(query: string) {
  const q = query.trim()
  return useQuery({
    queryKey: ['globalSearch', q],
    queryFn: () => globalSearch(q),
    enabled: q.length >= MIN_QUERY_LENGTH,
    staleTime: 1000 * 60, // 1 minute
  })
}
