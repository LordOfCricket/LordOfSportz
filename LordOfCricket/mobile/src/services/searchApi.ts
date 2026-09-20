import { searchPlayers } from './playerApi'
import { discoverTeams } from './teamApi'
import { searchGroundsByCity } from './groundApi'

/**
 * Global search — a thin fan-out over the LOC entity endpoints that
 * actually support text search:
 *   • Players  → GET /players?q=            (ILIKE on name / public id)
 *   • Teams    → GET /teams/discover?search= (ILIKE on team name)
 *   • Grounds  → GET /grounds/search?city=   (city match — the only
 *                text-based ground lookup the backend has)
 *
 * There is no server-side global/federated search endpoint and none is
 * invented here. Tournaments, matches and records have no name search on
 * the backend, so they are intentionally excluded.
 */

export type SearchEntityType = 'player' | 'team' | 'ground'

export interface SearchResultItem {
  type: SearchEntityType
  /** Stable key + navigation id (publicPlayerId / team id / publicGroundId). */
  id: string
  title: string
  subtitle?: string
}

export interface GlobalSearchResults {
  players: SearchResultItem[]
  teams: SearchResultItem[]
  grounds: SearchResultItem[]
  /** Groups whose request failed — surfaced so the UI can hint at partial results. */
  failed: SearchEntityType[]
}

const PER_GROUP_LIMIT = 8

export async function globalSearch(query: string): Promise<GlobalSearchResults> {
  const q = query.trim()

  const [playersRes, teamsRes, groundsRes] = await Promise.allSettled([
    searchPlayers(q, PER_GROUP_LIMIT, 0),
    discoverTeams(q, PER_GROUP_LIMIT, 0),
    searchGroundsByCity(q, PER_GROUP_LIMIT, 0),
  ])

  const failed: SearchEntityType[] = []

  let players: SearchResultItem[] = []
  if (playersRes.status === 'fulfilled') {
    players = (playersRes.value.items || []).map(({ player }) => ({
      type: 'player' as const,
      id: player.publicPlayerId,
      title: player.name,
      subtitle: [player.role, player.team?.name].filter(Boolean).join(' · ') || undefined,
    }))
  } else {
    failed.push('player')
  }

  let teams: SearchResultItem[] = []
  if (teamsRes.status === 'fulfilled') {
    const items: any[] = teamsRes.value?.items || []
    teams = items.map((t) => ({
      type: 'team' as const,
      id: String(t.id),
      title: t.name,
      subtitle: [t.shortName, t.squadCount != null ? `${t.squadCount} players` : null].filter(Boolean).join(' · ') || undefined,
    }))
  } else {
    failed.push('team')
  }

  let grounds: SearchResultItem[] = []
  if (groundsRes.status === 'fulfilled') {
    grounds = (groundsRes.value.grounds || []).map((g) => ({
      type: 'ground' as const,
      id: g.publicGroundId,
      title: g.name,
      subtitle: [g.city, g.state].filter(Boolean).join(', ') || undefined,
    }))
  } else {
    // A blank/too-short term makes /grounds/search 400 — that's an empty
    // result for this group, not a hard failure worth flagging.
    grounds = []
  }

  return { players, teams, grounds, failed }
}
