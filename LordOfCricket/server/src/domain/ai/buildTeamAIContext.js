// Phase 16 Part 14/44 — pure, bounded projection of the PUBLIC team profile
// DTO (publicTeam.service.js#getPublicTeamProfile) into AI context. Only the
// official record, recent form, and top performers already shown on the
// public Team Profile page — no tactical analysis, no independent
// recalculation.

const MAX_RECENT_FORM = 5
const MAX_RECENT_MATCHES = 5

export function buildTeamAIContext(profile) {
  return {
    teamId: profile.team.id,
    name: profile.team.name,
    shortName: profile.team.shortName,
    squadSize: profile.squad.length,
    record: {
      matches: profile.record.matches,
      wins: profile.record.wins,
      losses: profile.record.losses,
      ties: profile.record.ties,
      noResults: profile.record.noResults,
      winPercentage: profile.record.winPercentage,
    },
    recentForm: profile.recentForm.slice(0, MAX_RECENT_FORM).map((f) => ({ result: f.result, opponent: f.opponent, date: f.date })),
    recentMatches: profile.recentMatches.slice(0, MAX_RECENT_MATCHES).map((m) => ({
      opponent: m.teamA?.id === profile.team.id ? m.teamB?.name : m.teamA?.name,
      result: m.result,
      date: m.matchDate,
    })),
    topRunScorer: profile.topPerformers.topRunScorer ? { name: profile.topPerformers.topRunScorer.player.name, runs: profile.topPerformers.topRunScorer.runs } : null,
    topWicketTaker: profile.topPerformers.topWicketTaker ? { name: profile.topPerformers.topWicketTaker.player.name, wickets: profile.topPerformers.topWicketTaker.wickets } : null,
  }
}
