// Deterministic prose for a non-wicket delivery (Part 8/9). Consumes only
// already-authoritative facts (batRuns/illegal/extra/totalRuns, an optional
// wagon-wheel region_id) — invents no shot type, line, length, or fielder
// (Part 86: a stored region alone proves WHERE the ball went, not HOW it was
// played, so "FOUR through cover" is safe, "beautiful cover drive" is not).
import { pickTemplate, fillTemplate } from './templateSelect.js'
import { regionPhrase } from './regionPhrases.js'

const DOT_TEMPLATES = ['Dot ball. {bowler} keeps it tight.', '{bowler} to {striker}, no run.', '{striker} defends, no run scored.']
const SINGLE_TEMPLATES = ['{striker} takes a single{region}.', 'One run to {striker}{region}.', '{striker} rotates the strike{region}.']
const DOUBLE_TEMPLATES = ['{striker} comes back for two{region}.', 'Two runs{region}, well run by {striker}.']
const TRIPLE_TEMPLATES = ['Three runs taken{region}.', '{striker} picks up three{region}.']
const FOUR_TEMPLATES = ['FOUR! {striker} finds the boundary{region}.', 'FOUR! {striker} times it beautifully{region}.']
const SIX_TEMPLATES = ['SIX! {striker} clears the boundary{region}.', 'SIX! {striker} launches it{region}.']

/**
 * @param {object} params
 * @param {object} params.delivery - an enriched delivery from replayInnings() (voided/isDeadBall/wicket already checked by the caller)
 * @param {{name:string}|null} params.striker
 * @param {{name:string}|null} params.bowler
 * @param {string|null} params.regionId - wagon_wheel_shots.region_id, if this delivery has a recorded shot
 * @returns {{ text: string, tags: string[] } | null}
 */
export function buildDeliveryCommentary({ delivery, striker, bowler, regionId }) {
  if (delivery.voided || delivery.isDeadBall || delivery.wicket) return null

  const strikerName = striker?.name || 'The batsman'
  const bowlerName = bowler?.name || 'the bowler'
  const seed = delivery.id

  if (delivery.illegal?.type === 'wide') {
    const extra = delivery.illegal.runs > 1 ? ` (+${delivery.illegal.runs - 1} run${delivery.illegal.runs - 1 === 1 ? '' : 's'})` : ''
    return { text: `Wide.${extra}`, tags: ['WIDE'] }
  }

  if (delivery.illegal?.type === 'no-ball') {
    if (delivery.batRuns === 6) return { text: `NO BALL! ${strikerName} launches it for SIX — free hit next.`, tags: ['NO_BALL', 'SIX'] }
    if (delivery.batRuns === 4) return { text: `NO BALL! ${strikerName} finds the boundary — free hit next.`, tags: ['NO_BALL', 'FOUR'] }
    if (delivery.batRuns > 0) return { text: `NO BALL! ${strikerName} picks up ${delivery.batRuns} — free hit next.`, tags: ['NO_BALL'] }
    return { text: 'NO BALL! One extra — free hit to follow.', tags: ['NO_BALL'] }
  }

  if (delivery.extra?.type === 'bye') {
    return { text: `${delivery.extra.runs} bye${delivery.extra.runs === 1 ? '' : 's'}.`, tags: ['BYE'] }
  }
  if (delivery.extra?.type === 'leg-bye') {
    return { text: `${delivery.extra.runs} leg bye${delivery.extra.runs === 1 ? '' : 's'}.`, tags: ['LEG_BYE'] }
  }

  const throughPhrase = regionPhrase(regionId)
  const overPhrase = regionPhrase(regionId, { over: true })
  const vars = { striker: strikerName, bowler: bowlerName, region: throughPhrase ? ` ${throughPhrase}` : '' }
  const varsOver = { ...vars, region: overPhrase ? ` ${overPhrase}` : '' }

  switch (delivery.batRuns) {
    case 0:
      return { text: fillTemplate(pickTemplate(DOT_TEMPLATES, seed), vars), tags: ['DOT'] }
    case 1:
      return { text: fillTemplate(pickTemplate(SINGLE_TEMPLATES, seed), vars), tags: ['SINGLE'] }
    case 2:
      return { text: fillTemplate(pickTemplate(DOUBLE_TEMPLATES, seed), vars), tags: ['DOUBLE'] }
    case 3:
      return { text: fillTemplate(pickTemplate(TRIPLE_TEMPLATES, seed), vars), tags: ['TRIPLE'] }
    case 4:
      return { text: fillTemplate(pickTemplate(FOUR_TEMPLATES, seed), vars), tags: ['FOUR'] }
    case 5:
      return { text: `Five runs{region} — quick running between the wickets.`.replace('{region}', vars.region), tags: ['FIVE'] }
    case 6:
      return { text: fillTemplate(pickTemplate(SIX_TEMPLATES, seed), varsOver), tags: ['SIX'] }
    default:
      return { text: `${delivery.batRuns} runs.`, tags: [] }
  }
}
