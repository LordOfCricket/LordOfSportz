import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as availabilityApi from '../services/matchAvailabilityApi'
import { AvailabilityStatus } from '../services/matchAvailabilityApi'

export function useMyAvailability(matchId: number | null) {
  return useQuery({
    queryKey: ['availability', matchId],
    queryFn: () => availabilityApi.fetchMyAvailability(matchId as number),
    enabled: !!matchId,
    staleTime: 1000 * 60,
  })
}

export function useSetMyAvailability(matchId: number | null) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (status: AvailabilityStatus) => availabilityApi.setMyAvailability(matchId as number, status),
    onSuccess: (data) => {
      queryClient.setQueryData(['availability', matchId], data)
    },
  })
}
