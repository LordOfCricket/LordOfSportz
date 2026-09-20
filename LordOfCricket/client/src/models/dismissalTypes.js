// Mirrors server/src/domain/scoring/eventTypes.js DISMISSAL_TYPES — the
// server is authoritative on which are actually allowed for a given delivery
// (free hit, wide, ...); this list is just display labels for the picker.
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

export const FIELDING_EVENT_TYPES = [
  { id: 'catch-dropped', label: 'Catch Dropped' },
  { id: 'fielding-event', label: 'Fielding Event' },
  { id: 'appeal', label: 'Appeal' },
  { id: 'review', label: 'Review' },
]

export const CORRECTION_REASONS = [
  { id: 'WRONG_RUNS', label: 'Wrong Runs' },
  { id: 'WRONG_EXTRA', label: 'Wrong Extra' },
  { id: 'WRONG_WICKET', label: 'Wrong Wicket' },
  { id: 'WRONG_BATSMAN', label: 'Wrong Batsman' },
  { id: 'WRONG_BOWLER', label: 'Wrong Bowler' },
  { id: 'WRONG_FIELDER', label: 'Wrong Fielder' },
  { id: 'WRONG_SHOT', label: 'Wrong Shot' },
  { id: 'ACCIDENTAL_DELIVERY', label: 'Accidental Delivery' },
  { id: 'MISSED_DELIVERY', label: 'Missed Delivery' },
  { id: 'OTHER', label: 'Other' },
]
