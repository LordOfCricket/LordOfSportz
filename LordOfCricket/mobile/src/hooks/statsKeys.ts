// TanStack Query key factory for leaderboard / analytics / comparison
// queries. Same pattern as playerKeys.ts.

export const statsKeys = {
  all: ['stats'] as const,

  leaderboard: (metric: string, role: string | null, teamId: number | null, limit: number, offset: number) =>
    [...statsKeys.all, 'leaderboard', metric, { role, teamId, limit, offset }] as const,

  cricketRecords: () => [...statsKeys.all, 'cricket-records'] as const,

  playerAnalytics: (publicPlayerId: string, recent: number) =>
    [...statsKeys.all, 'player-analytics', publicPlayerId, { recent }] as const,

  playerComparison: (p1: string, p2: string) =>
    [...statsKeys.all, 'player-comparison', p1, p2] as const,

  playerHeadToHead: (p1: string, p2: string) =>
    [...statsKeys.all, 'player-head-to-head', p1, p2] as const,

  teamComparison: (t1: number, t2: number) =>
    [...statsKeys.all, 'team-comparison', t1, t2] as const,
}
