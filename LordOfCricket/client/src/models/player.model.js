export const PLAYING_ROLE_LABELS = {
  BATSMAN: 'Batsman',
  BOWLER: 'Bowler',
  ALL_ROUNDER: 'All-Rounder',
  WICKET_KEEPER: 'Wicket-Keeper',
  WICKET_KEEPER_BATSMAN: 'Wicket-Keeper Batsman',
}

export const BATTING_STYLE_LABELS = {
  RIGHT_HAND: 'Right-hand bat',
  LEFT_HAND: 'Left-hand bat',
}

export const BOWLING_STYLE_LABELS = {
  RIGHT_ARM_FAST: 'Right-arm fast',
  RIGHT_ARM_MEDIUM: 'Right-arm medium',
  RIGHT_ARM_OFF_BREAK: 'Right-arm off break',
  RIGHT_ARM_LEG_BREAK: 'Right-arm leg break',
  LEFT_ARM_FAST: 'Left-arm fast',
  LEFT_ARM_MEDIUM: 'Left-arm medium',
  LEFT_ARM_ORTHODOX: 'Left-arm orthodox',
  LEFT_ARM_WRIST_SPIN: 'Left-arm wrist spin',
  NONE: 'Does not bowl',
}

// First-Login Player Profile Onboarding — the backend's bowling_style enum
// (BOWLING_STYLE_LABELS above) already combines arm+pace/spin into one of 9
// flat values (plus NONE); the brief wants a step-by-step picker instead of
// one giant dropdown of those 9 raw values. Rather than inventing new enum
// values or extra columns, this decomposes/composes the SAME existing
// bowling_style value into the 3 progressive UI questions (arm, pace vs.
// spin, spin type) and back — the stored value never changes shape.
export const BOWLING_ARM_LABELS = { RIGHT: 'Right Arm', LEFT: 'Left Arm' }

// "Fast-Medium"/"Medium-Fast" from standard cricket terminology both collapse
// to the existing MEDIUM enum value — the backend enum only distinguishes
// FAST vs MEDIUM per arm (no finer pace gradation to store), so offering 5
// pace options here would produce a UI promise the data model can't keep.
export const BOWLING_TYPE_LABELS = { FAST: 'Fast', MEDIUM: 'Medium', SPIN: 'Spin' }

// Right-arm spin only ever means off break / leg break in this enum;
// left-arm spin only ever means orthodox / wrist spin — arm selection
// determines which pair applies, matching real cricket terminology.
export const SPIN_TYPE_LABELS_BY_ARM = {
  RIGHT: { RIGHT_ARM_OFF_BREAK: 'Off Spin', RIGHT_ARM_LEG_BREAK: 'Leg Spin' },
  LEFT: { LEFT_ARM_ORTHODOX: 'Left-Arm Orthodox', LEFT_ARM_WRIST_SPIN: 'Left-Arm Wrist Spin' },
}

const BOWLING_STYLE_TO_PARTS = {
  RIGHT_ARM_FAST: { bowls: true, arm: 'RIGHT', type: 'FAST', spinStyle: null },
  RIGHT_ARM_MEDIUM: { bowls: true, arm: 'RIGHT', type: 'MEDIUM', spinStyle: null },
  RIGHT_ARM_OFF_BREAK: { bowls: true, arm: 'RIGHT', type: 'SPIN', spinStyle: 'RIGHT_ARM_OFF_BREAK' },
  RIGHT_ARM_LEG_BREAK: { bowls: true, arm: 'RIGHT', type: 'SPIN', spinStyle: 'RIGHT_ARM_LEG_BREAK' },
  LEFT_ARM_FAST: { bowls: true, arm: 'LEFT', type: 'FAST', spinStyle: null },
  LEFT_ARM_MEDIUM: { bowls: true, arm: 'LEFT', type: 'MEDIUM', spinStyle: null },
  LEFT_ARM_ORTHODOX: { bowls: true, arm: 'LEFT', type: 'SPIN', spinStyle: 'LEFT_ARM_ORTHODOX' },
  LEFT_ARM_WRIST_SPIN: { bowls: true, arm: 'LEFT', type: 'SPIN', spinStyle: 'LEFT_ARM_WRIST_SPIN' },
  NONE: { bowls: false, arm: null, type: null, spinStyle: null },
}

// `bowling_style` on the player row: undefined/null = not answered yet
// (onboarding skipped this section), 'NONE' = explicitly "No", any of the
// other 8 = an actual style. Three real states, never conflated.
export function decomposeBowlingStyle(bowlingStyle) {
  if (!bowlingStyle) return { bowls: null, arm: null, type: null, spinStyle: null }
  return BOWLING_STYLE_TO_PARTS[bowlingStyle] || { bowls: null, arm: null, type: null, spinStyle: null }
}

export function composeBowlingStyle({ bowls, arm, type, spinStyle }) {
  if (bowls === false) return 'NONE'
  if (!bowls || !arm) return null
  if (type === 'FAST') return arm === 'RIGHT' ? 'RIGHT_ARM_FAST' : 'LEFT_ARM_FAST'
  if (type === 'MEDIUM') return arm === 'RIGHT' ? 'RIGHT_ARM_MEDIUM' : 'LEFT_ARM_MEDIUM'
  if (type === 'SPIN') return spinStyle || null
  return null
}

export function roleLabel(role) {
  return (role && PLAYING_ROLE_LABELS[role]) || null
}

export function battingStyleLabel(style) {
  return (style && BATTING_STYLE_LABELS[style]) || null
}

export function bowlingStyleLabel(style) {
  return (style && BOWLING_STYLE_LABELS[style]) || null
}

export function initials(name) {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

const COMPLETION_FIELDS = ['role', 'batting_style', 'photo_url', 'city', 'jersey_number']

export function profileCompletion(player) {
  if (!player) return 0
  const filled = COMPLETION_FIELDS.filter((field) => player[field] !== null && player[field] !== undefined && player[field] !== '')
  return Math.round((filled.length / COMPLETION_FIELDS.length) * 100)
}

// Which career stats matter most for a given playing role — used to prioritize
// the Career Overview / Statistics UI once real aggregation exists. Batting
// stats are the safe fallback for roles that haven't been set yet.
export function statPriorityForRole(role) {
  switch (role) {
    case 'BOWLER':
      return ['wickets', 'economy', 'average', 'bestBowling']
    case 'ALL_ROUNDER':
      return ['runs', 'wickets', 'average', 'economy']
    case 'WICKET_KEEPER':
    case 'WICKET_KEEPER_BATSMAN':
      return ['runs', 'catches', 'stumpings']
    case 'BATSMAN':
    default:
      return ['runs', 'average', 'strikeRate', 'highestScore']
  }
}
