import { useQuery } from '@tanstack/react-query'
import * as statisticsApi from '../services/statisticsApi'
import * as playerApi from '../services/playerApi'
import { EMERGING_MAX_MATCHES } from './useHallOfFame'

const POOL_SIZE = 30
const MAX_SHOWN = 8

export interface NextGenerationPlayer {
  publicPlayerId: string
  name: string
  role: string | null
  photoUrl: string | null
  runs: number
  matches: number | null
}

async function loadNextGeneration(): Promise<NextGenerationPlayer[]> {
  const board = await statisticsApi.fetchLeaderboard('runs', { limit: POOL_SIZE })
  const emerging = board.items.filter((i) => (i.secondary?.matches ?? Infinity) <= EMERGING_MAX_MATCHES).slice(0, MAX_SHOWN)
  const profiles = await Promise.all(emerging.map((i) => playerApi.getPublicPlayerProfile(i.player.publicPlayerId).catch(() => null)))

  return emerging.map((i, idx) => ({
    publicPlayerId: i.player.publicPlayerId,
    name: i.player.name,
    role: i.player.role,
    // QA fix: real field is .photoUrl (PublicPlayerProfile is camelCase),
    // not .photo_url — the old key was always undefined here.
    photoUrl: profiles[idx]?.photoUrl ?? null,
    // 'runs' leaderboard values are always numeric; the guard is only here
    // because LeaderboardItem.value is a union (highest-score/best-bowling
    // return objects).
    runs: typeof i.value === 'number' ? i.value : 0,
    matches: i.secondary?.matches ?? null,
  }))
}

export function useNextGeneration() {
  return useQuery({
    queryKey: ['nextGeneration'],
    queryFn: loadNextGeneration,
    staleTime: 1000 * 60 * 10, // 10 minutes
  })
}
