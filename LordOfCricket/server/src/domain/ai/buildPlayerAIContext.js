// Phase 16 Part 12/13/43 — pure, bounded projection of the PUBLIC player
// career-stats DTO (statistics.service.js#getPlayerCareerStats) into AI
// context. Only official, finalized-match career figures — the same ones
// the public Player Profile page already shows — no independent
// recalculation, no ratings/predictions/personality judgments ever included
// (those are Part 13's explicit boundary, enforced by never being present
// in the context to begin with, not by hoping the model declines to invent
// them).

const MAX_RECENT_FORM = 5

export function buildPlayerAIContext(careerStats) {
  return {
    publicPlayerId: careerStats.player.publicPlayerId,
    name: careerStats.player.name,
    role: careerStats.player.role,
    matches: careerStats.career.matches,
    batting: {
      innings: careerStats.career.batting.innings,
      runs: careerStats.career.batting.runs,
      average: careerStats.career.batting.average,
      strikeRate: careerStats.career.batting.strikeRate,
      fifties: careerStats.career.batting.fifties,
      hundreds: careerStats.career.batting.hundreds,
      highestScore: careerStats.career.batting.highestScore,
    },
    bowling: {
      innings: careerStats.career.bowling.innings,
      wickets: careerStats.career.bowling.wickets,
      average: careerStats.career.bowling.average,
      economy: careerStats.career.bowling.economy,
      bestBowling: careerStats.career.bowling.bestBowling,
    },
    fielding: {
      catches: careerStats.career.fielding.catches,
      runOuts: careerStats.career.fielding.runOuts,
      stumpings: careerStats.career.fielding.stumpings,
    },
    recentForm: careerStats.recentForm.slice(0, MAX_RECENT_FORM).map((p) => ({
      opponent: p.opponent,
      result: p.result,
      won: p.won,
      batting: p.batting?.didBat ? { runs: p.batting.runs, balls: p.batting.balls, notOut: p.batting.notOut } : null,
      bowling: p.bowling?.didBowl ? { wickets: p.bowling.wickets, runs: p.bowling.runs } : null,
    })),
  }
}
