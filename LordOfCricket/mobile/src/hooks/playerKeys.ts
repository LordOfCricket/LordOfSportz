// Centralized TanStack Query key factory for player queries
// Follows TanStack Query best practices for type-safe cache invalidation

export const playerKeys = {
  all: ['player'] as const,
  
  // Authenticated user's own player profile
  me: () => [...playerKeys.all, 'me'] as const,
  
  // Authenticated user's statistics
  stats: () => [...playerKeys.all, 'stats'] as const,
  statsWithPagination: (limit: number, offset: number) => 
    [...playerKeys.stats(), { limit, offset }] as const,
  
  // Public player profile
  public: (publicPlayerId: string) => 
    [...playerKeys.all, 'public', publicPlayerId] as const,
  
  // Public player statistics
  publicStats: (publicPlayerId: string) =>
    [...playerKeys.all, 'public-stats', publicPlayerId] as const,
  publicStatsWithPagination: (publicPlayerId: string, limit: number, offset: number) =>
    [...playerKeys.publicStats(publicPlayerId), { limit, offset }] as const,

  // Player directory/search (GET /players)
  search: (query: string, limit: number, offset: number) =>
    [...playerKeys.all, 'search', query, limit, offset] as const,
}
