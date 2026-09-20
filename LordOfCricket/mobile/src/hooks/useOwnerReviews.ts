import { useQuery } from '@tanstack/react-query'
import * as groundOwnerApi from '../services/groundOwnerApi'
import { groundOwnerKeys } from './useMyGrounds'

// Page-1 fetch with a growing limit (server clamps to 50), matching the
// "load more" pattern used elsewhere in the owner app.
export function useGroundReviews(publicGroundId: string | undefined, limit: number) {
  return useQuery({
    queryKey: groundOwnerKeys.reviews(publicGroundId ?? 'none', limit),
    queryFn: () => groundOwnerApi.fetchGroundReviews(publicGroundId as string, { page: 1, limit }),
    enabled: Boolean(publicGroundId),
    staleTime: 1000 * 60,
    retry: false,
  })
}
