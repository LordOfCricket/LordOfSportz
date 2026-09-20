import { useQuery } from '@tanstack/react-query'
import { fetchCricketRecords, CricketRecords } from '../services/statisticsApi'
import { statsKeys } from './statsKeys'

/**
 * GET /stats/records — LOC match & team records (highest team total, highest
 * match aggregate, biggest wins by runs / by wickets, highest successful
 * chase) across all finalized matches. Same public endpoint the website's
 * Records page uses. Cached 5 minutes (records only move when a match is
 * finalized).
 */
export function useCricketRecords() {
  return useQuery<CricketRecords>({
    queryKey: statsKeys.cricketRecords(),
    queryFn: fetchCricketRecords,
    staleTime: 1000 * 60 * 5,
  })
}
