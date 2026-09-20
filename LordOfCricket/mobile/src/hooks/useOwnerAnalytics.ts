import { useMutation, useQuery } from '@tanstack/react-query'
import * as groundOwnerApi from '../services/groundOwnerApi'
import { groundOwnerKeys } from './useMyGrounds'
import { OwnerAnalyticsRange } from '../types'

export function useGroundAnalytics(publicGroundId: string | undefined, range: OwnerAnalyticsRange) {
  return useQuery({
    queryKey: groundOwnerKeys.analytics(publicGroundId ?? 'none', range),
    queryFn: () => groundOwnerApi.fetchGroundAnalytics(publicGroundId as string, range),
    enabled: Boolean(publicGroundId),
    staleTime: 1000 * 60,
    retry: false,
  })
}

export function useGroundAnalyticsTrends(publicGroundId: string | undefined, range: OwnerAnalyticsRange) {
  return useQuery({
    queryKey: groundOwnerKeys.analyticsTrends(publicGroundId ?? 'none', range),
    queryFn: () => groundOwnerApi.fetchGroundAnalyticsTrends(publicGroundId as string, range),
    enabled: Boolean(publicGroundId),
    staleTime: 1000 * 60,
    retry: false,
  })
}

// Fetched on demand (button press) — the CSV body is only ever previewed,
// never stored, since the app has no file-system / share dependency.
export function useGroundAnalyticsCsv(publicGroundId: string) {
  return useMutation({
    mutationFn: (range: OwnerAnalyticsRange) => groundOwnerApi.fetchGroundAnalyticsCsv(publicGroundId, range),
  })
}
