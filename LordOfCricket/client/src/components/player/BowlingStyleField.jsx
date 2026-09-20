import { useState } from 'react'
import RadioCardGroup from '../ui/RadioCardGroup.jsx'
import { BOWLING_ARM_LABELS, BOWLING_TYPE_LABELS, SPIN_TYPE_LABELS_BY_ARM, composeBowlingStyle, decomposeBowlingStyle } from '../../models/player.model.js'

const BOWL_YES_NO = [
  { value: 'YES', label: 'Yes' },
  { value: 'NO', label: 'No' },
]
const ARM_OPTIONS = Object.entries(BOWLING_ARM_LABELS).map(([value, label]) => ({ value, label }))
const TYPE_OPTIONS = Object.entries(BOWLING_TYPE_LABELS).map(([value, label]) => ({ value, label }))

// Progressive selection (bowl? -> arm -> pace/spin -> spin type), composing
// down to the single existing players.bowling_style enum value once the
// answer is complete enough to have a real value — the parent form only
// ever sees that one string (or null/'NONE'), same shape it already saves
// today. An IN-PROGRESS answer (e.g. "Yes" but arm not chosen yet) has no
// valid enum value to compose into, so it can't be derived back out of
// `value` on every render — this component owns that in-progress state
// itself (initialized once from decomposeBowlingStyle(value), so editing an
// existing player's saved style still starts on the right step) and only
// pushes a composed value up to the parent once one exists.
export default function BowlingStyleField({ value, onChange }) {
  const [parts, setParts] = useState(() => decomposeBowlingStyle(value))
  const { bowls, arm, type, spinStyle } = parts

  const spinOptions = arm ? Object.entries(SPIN_TYPE_LABELS_BY_ARM[arm] || {}).map(([v, label]) => ({ value: v, label })) : []

  const update = (next) => {
    setParts(next)
    onChange(composeBowlingStyle(next))
  }

  const setBowls = (answer) => {
    if (answer === 'NO') {
      update({ bowls: false, arm: null, type: null, spinStyle: null })
    } else {
      // Re-entering "Yes" after "No" (or from unanswered) starts the
      // sub-questions fresh — composeBowlingStyle returns null until arm is
      // also chosen, so this never guesses a style on the user's behalf.
      update({ bowls: true, arm, type, spinStyle })
    }
  }

  const setArm = (nextArm) => {
    // Changing arm invalidates a previously-chosen spin type from the OTHER
    // arm's list (e.g. switching Right -> Left after picking Off Spin) —
    // clear it rather than silently keeping an impossible combination.
    update({ bowls: true, arm: nextArm, type, spinStyle: null })
  }

  const setType = (nextType) => {
    update({ bowls: true, arm, type: nextType, spinStyle: nextType === 'SPIN' ? spinStyle : null })
  }

  const setSpinStyle = (nextSpinStyle) => {
    update({ bowls: true, arm, type: 'SPIN', spinStyle: nextSpinStyle })
  }

  return (
    <div className="space-y-5">
      <RadioCardGroup label="Do you bowl?" name="bowls" options={BOWL_YES_NO} value={bowls === null ? null : bowls ? 'YES' : 'NO'} onChange={setBowls} />

      {bowls && (
        <>
          <RadioCardGroup label="Bowling Arm" name="bowlingArm" options={ARM_OPTIONS} value={arm} onChange={setArm} />
          {arm && <RadioCardGroup label="Bowling Type" name="bowlingType" options={TYPE_OPTIONS} value={type} onChange={setType} className="sm:grid-cols-3" />}
          {type === 'SPIN' && arm && <RadioCardGroup label="Spin Type" name="spinType" options={spinOptions} value={spinStyle} onChange={setSpinStyle} />}
        </>
      )}
    </div>
  )
}
