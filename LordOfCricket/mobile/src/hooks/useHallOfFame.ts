import { useQuery } from '@tanstack/react-query'
import * as statisticsApi from '../services/statisticsApi'
import * as playerApi from '../services/playerApi'

// Same "emerging" threshold/definition as the website's Hall of Fame /
// Next Generation sections: strong stats, few career matches — never age,
// since no DOB field exists anywhere in the schema.
export const EMERGING_MAX_MATCHES = 5
const EMERGING_POOL_SIZE = 20

export interface HallOfFamePlayer {
  publicPlayerId: string
  name: string
  role: string | null
  photoUrl: string | null
  headline: string
}

export interface HallOfFameCategory {
  key: string
  label: string
  player: HallOfFamePlayer | null
}

async function loadHallOfFame(): Promise<HallOfFameCategory[]> {
  const [runsBoard, scoreBoard, wicketsBoard] = await Promise.all([
    statisticsApi.fetchLeaderboard('runs', { limit: EMERGING_POOL_SIZE }),
    statisticsApi.fetchLeaderboard('highest-score', { limit: 1 }),
    statisticsApi.fetchLeaderboard('wickets', { limit: 1 }),
  ])

  const topPerformer = runsBoard.items[0] || null
  const maximumScore = scoreBoard.items[0] || null
  const maximumWickets = wicketsBoard.items[0] || null
  const emergingPlayer = runsBoard.items.find((i) => (i.secondary?.matches ?? Infinity) <= EMERGING_MAX_MATCHES) || null

  const entries = [
    { key: 'topPerformer', label: 'Top Performer', item: topPerformer, headline: (i: any) => `${i.value} Runs` },
    {
      key: 'maximumScore',
      label: 'Max Scorer',
      item: maximumScore,
      headline: (i: any) => `${i.value.runs}${i.value.notOut ? '*' : ''} Runs`,
    },
    { key: 'maximumWickets', label: 'Max Wickets', item: maximumWickets, headline: (i: any) => `${i.value} Wickets` },
    { key: 'emergingPlayer', label: 'Emerging Player', item: emergingPlayer, headline: (i: any) => `${i.value} Runs` },
  ]

  const uniqueIds = [...new Set(entries.filter((e) => e.item).map((e) => e.item!.player.publicPlayerId))]
  const profiles = await Promise.all(uniqueIds.map((id) => playerApi.getPublicPlayerProfile(id).catch(() => null)))
  // QA fix: getPublicPlayerProfile() returns PublicPlayerProfile (camelCase
  // .photoUrl), not the private Player shape (.photo_url) — the old key here
  // was always undefined, silently defaulting every photo to null.
  const photoById = Object.fromEntries(uniqueIds.map((id, i) => [id, profiles[i]?.photoUrl ?? null]))

  return entries.map((e) => ({
    key: e.key,
    label: e.label,
    player: e.item
      ? {
          publicPlayerId: e.item.player.publicPlayerId,
          name: e.item.player.name,
          role: e.item.player.role,
          photoUrl: photoById[e.item.player.publicPlayerId] ?? null,
          headline: e.headline(e.item),
        }
      : null,
  }))
}

export function useHallOfFame() {
  return useQuery({
    queryKey: ['hallOfFame'],
    queryFn: loadHallOfFame,
    staleTime: 1000 * 60 * 10, // 10 minutes
  })
}
