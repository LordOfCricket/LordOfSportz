import { useQuery } from '@tanstack/react-query'
import * as partnersApi from '../services/partnersApi'

export function usePartners() {
  return useQuery({
    queryKey: ['partners'],
    queryFn: () => partnersApi.getPartners(),
    staleTime: 1000 * 60 * 10, // 10 minutes
  })
}
