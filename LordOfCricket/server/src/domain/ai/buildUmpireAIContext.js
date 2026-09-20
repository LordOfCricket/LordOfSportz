// Umpire Intelligence & Scale 2.0 — pure, bounded projection of an umpire's
// own reputation summary + monthly trend into AI context. Only fields
// already surfaced elsewhere (GET /umpire/profile, GET /umpire/statistics/
// trend) — same "no independent recalculation, nothing private" rule
// buildPlayerAIContext/buildTeamAIContext already follow.
const MAX_TREND_MONTHS = 6

export function buildUmpireAIContext(reputationSummary, trendMonths) {
  return {
    name: reputationSummary.name,
    verified: reputationSummary.verified,
    matchesOfficiated: reputationSummary.matchesOfficiated,
    reliability: reputationSummary.reliability,
    ratingAvg: reputationSummary.ratingAvg,
    ratingCount: reputationSummary.ratingCount,
    experienceYears: reputationSummary.experienceYears,
    badges: reputationSummary.badges,
    monthlyTrend: (trendMonths || []).slice(-MAX_TREND_MONTHS).map((m) => ({
      month: m.month,
      matchesOfficiated: m.matchesOfficiated,
      reliability: m.reliability,
      ratingAvg: m.ratingAvg,
    })),
  }
}
