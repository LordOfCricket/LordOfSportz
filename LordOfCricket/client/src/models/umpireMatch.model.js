// Mock match setup for the Umpire Testing prototype. Client-side only — no backend calls.
// Shaped so a later backend swap only needs to replace these constants with fetched data.

export const DISMISSAL_TYPES = [
  { id: 'bowled', label: 'Bowled' },
  { id: 'caught', label: 'Caught' },
  { id: 'lbw', label: 'LBW' },
  { id: 'run-out', label: 'Run Out' },
  { id: 'stumped', label: 'Stumped' },
  { id: 'hit-wicket', label: 'Hit Wicket' },
  { id: 'obstructing-field', label: 'Obstructing the Field' },
  { id: 'hit-ball-twice', label: 'Hit the Ball Twice' },
  { id: 'timed-out', label: 'Timed Out' },
  { id: 'retired-out', label: 'Retired Out' },
]

// Dismissal types credited to the bowler's figures.
export const BOWLER_CREDITED_DISMISSALS = ['bowled', 'caught', 'lbw', 'stumped', 'hit-wicket']

// Non-scoring match events (section 10) — logged alongside deliveries, never touch the score.
export const FIELDING_EVENT_TYPES = [
  { id: 'misfield', label: 'Misfield' },
  { id: 'direct-hit', label: 'Direct Hit' },
  { id: 'run-out-attempt', label: 'Run Out Attempt' },
  { id: 'stumping-attempt', label: 'Stumping Attempt' },
  { id: 'overthrow', label: 'Overthrow' },
  { id: 'boundary-save', label: 'Boundary Save' },
  { id: 'diving-stop', label: 'Diving Stop' },
  { id: 'fielding-error', label: 'Fielding Error' },
  { id: 'exceptional-fielding', label: 'Exceptional Fielding' },
]

export const APPEAL_TYPES = [
  { id: 'lbw', label: 'LBW' },
  { id: 'caught-behind', label: 'Caught Behind' },
  { id: 'run-out', label: 'Run Out' },
  { id: 'stumping', label: 'Stumping' },
  { id: 'other', label: 'Other' },
]

export const REVIEW_TYPES = [
  { id: 'player-review', label: 'Player Review' },
  { id: 'umpire-review', label: 'Umpire Review' },
  { id: 'run-out-check', label: 'Run Out Check' },
  { id: 'stumping-check', label: 'Stumping Check' },
  { id: 'boundary-check', label: 'Boundary Check' },
  { id: 'catch-check', label: 'Catch Check' },
]

export const CATCH_CHANCE_LEVELS = [
  { id: 'easy', label: 'Easy Chance' },
  { id: 'moderate', label: 'Moderate Chance' },
  { id: 'difficult', label: 'Difficult Chance' },
]

export const MATCH_FORMAT = {
  label: 'T20',
  oversPerInnings: 20,
  powerplayOvers: 6,
}

export const TEAM_A = {
  id: 'team-india',
  name: 'India',
  shortName: 'IND',
  players: [
    { id: 'ind-1', name: 'Rohit Sharma', role: 'Batter' },
    { id: 'ind-2', name: 'Virat Kohli', role: 'Batter' },
    { id: 'ind-3', name: 'Suryakumar Yadav', role: 'Batter' },
    { id: 'ind-4', name: 'Shreyas Iyer', role: 'Batter' },
    { id: 'ind-5', name: 'Hardik Pandya', role: 'All-rounder' },
    { id: 'ind-6', name: 'Ravindra Jadeja', role: 'All-rounder' },
    { id: 'ind-7', name: 'KL Rahul', role: 'Wicket-keeper' },
    { id: 'ind-8', name: 'Axar Patel', role: 'Bowler' },
    { id: 'ind-9', name: 'Jasprit Bumrah', role: 'Bowler' },
    { id: 'ind-10', name: 'Mohammed Shami', role: 'Bowler' },
    { id: 'ind-11', name: 'Kuldeep Yadav', role: 'Bowler' },
  ],
}

export const TEAM_B = {
  id: 'team-australia',
  name: 'Australia',
  shortName: 'AUS',
  players: [
    { id: 'aus-1', name: 'David Warner', role: 'Batter' },
    { id: 'aus-2', name: 'Travis Head', role: 'Batter' },
    { id: 'aus-3', name: 'Steve Smith', role: 'Batter' },
    { id: 'aus-4', name: 'Marnus Labuschagne', role: 'Batter' },
    { id: 'aus-5', name: 'Glenn Maxwell', role: 'All-rounder' },
    { id: 'aus-6', name: 'Marcus Stoinis', role: 'All-rounder' },
    { id: 'aus-7', name: 'Alex Carey', role: 'Wicket-keeper' },
    { id: 'aus-8', name: 'Pat Cummins', role: 'Bowler' },
    { id: 'aus-9', name: 'Mitchell Starc', role: 'Bowler' },
    { id: 'aus-10', name: 'Josh Hazlewood', role: 'Bowler' },
    { id: 'aus-11', name: 'Adam Zampa', role: 'Bowler' },
  ],
}

export function createInitialMatch() {
  return {
    matchId: 'umpire-testing-match',
    venue: 'Lord of Cricket Ground',
    format: MATCH_FORMAT,
    teams: { [TEAM_A.id]: TEAM_A, [TEAM_B.id]: TEAM_B },
    battingFirstId: TEAM_A.id,
    currentInningsIndex: 0,
    innings: [
      { battingTeamId: TEAM_A.id, bowlingTeamId: TEAM_B.id, log: [], corrections: [] },
    ],
  }
}

export function getPlayer(match, playerId) {
  if (!playerId) return null
  for (const team of Object.values(match.teams)) {
    const player = team.players.find((p) => p.id === playerId)
    if (player) return player
  }
  return null
}

export function getTeamPlayers(match, teamId) {
  return match.teams[teamId]?.players || []
}
