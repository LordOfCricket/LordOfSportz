import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateStructuredOutput } from './validateStructuredOutput.js'
import { MATCH_INSIGHT_SCHEMA } from '../../ai/schemas/matchInsightSchema.js'
import { PERSON_INSIGHT_SCHEMA } from '../../ai/schemas/personInsightSchema.js'

const validMatchInsight = {
  headline: 'Strikers seal a thriller',
  summary: 'A tense finish.',
  keyMoments: [{ candidateId: 'km-1', explanation: 'The key wicket that turned the match.' }],
  standoutPerformers: [{ publicPlayerId: 'LOC-AB12CD', reason: 'Top scorer with 64.' }],
}

test('valid match insight passes', () => {
  const { valid, errors } = validateStructuredOutput(validMatchInsight, MATCH_INSIGHT_SCHEMA)
  assert.equal(valid, true)
  assert.deepEqual(errors, [])
})

test('missing required field fails', () => {
  const clone = { ...validMatchInsight }
  delete clone.headline
  const result = validateStructuredOutput(clone, MATCH_INSIGHT_SCHEMA)
  assert.equal(result.valid, false)
  assert.ok(result.errors.some((e) => e.includes('headline')))
})

test('wrong field type fails', () => {
  const { valid, errors } = validateStructuredOutput({ ...validMatchInsight, headline: 12345 }, MATCH_INSIGHT_SCHEMA)
  assert.equal(valid, false)
  assert.ok(errors.some((e) => e.includes('headline')))
})

test('oversized array fails', () => {
  const tooMany = { ...validMatchInsight, keyMoments: Array.from({ length: 6 }, (_, i) => ({ candidateId: `km-${i}`, explanation: 'x' })) }
  const { valid, errors } = validateStructuredOutput(tooMany, MATCH_INSIGHT_SCHEMA)
  assert.equal(valid, false)
  assert.ok(errors.some((e) => e.includes('maxItems')))
})

test('oversized string fails', () => {
  const tooLong = { ...validMatchInsight, summary: 'x'.repeat(1201) }
  const { valid, errors } = validateStructuredOutput(tooLong, MATCH_INSIGHT_SCHEMA)
  assert.equal(valid, false)
  assert.ok(errors.some((e) => e.includes('maxLength')))
})

test('unknown top-level field fails (additionalProperties: false)', () => {
  const withExtra = { ...validMatchInsight, matchWinner: 'Team A' }
  const { valid, errors } = validateStructuredOutput(withExtra, MATCH_INSIGHT_SCHEMA)
  assert.equal(valid, false)
  assert.ok(errors.some((e) => e.includes('matchWinner')))
})

test('malformed nested item fails', () => {
  const badItem = { ...validMatchInsight, keyMoments: [{ candidateId: 'km-1' }] } // missing explanation
  const { valid, errors } = validateStructuredOutput(badItem, MATCH_INSIGHT_SCHEMA)
  assert.equal(valid, false)
  assert.ok(errors.some((e) => e.includes('explanation')))
})

test('person insight schema (player/team share it): valid and invalid', () => {
  const good = { headline: 'Consistent form', summary: 'Steady contributor.', highlights: ['64 runs in the last match'] }
  assert.equal(validateStructuredOutput(good, PERSON_INSIGHT_SCHEMA).valid, true)

  const bad = { headline: 'x', summary: 'y' } // missing highlights
  assert.equal(validateStructuredOutput(bad, PERSON_INSIGHT_SCHEMA).valid, false)
})
