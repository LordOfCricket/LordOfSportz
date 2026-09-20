import { test } from 'node:test'
import assert from 'node:assert/strict'
import { badgeLabel, badgeDescription, experienceLabel, hasEnoughDataForTrend } from './umpireReputation.model.js'

test('badgeLabel maps every known badge key, falls back to the raw key for an unknown one', () => {
  assert.equal(badgeLabel('HIGHLY_RELIABLE'), 'Highly Reliable')
  assert.equal(badgeLabel('TOP_RATED'), 'Top Rated')
  assert.equal(badgeLabel('EXPERIENCED_OFFICIAL'), 'Experienced Official')
  assert.equal(badgeLabel('SOMETHING_NEW'), 'SOMETHING_NEW')
})

test('badgeDescription returns a real description for known badges, empty string for unknown', () => {
  assert.ok(badgeDescription('HIGHLY_RELIABLE').length > 0)
  assert.equal(badgeDescription('UNKNOWN'), '')
})

test('experienceLabel: null means no data, 0 means "New", otherwise pluralizes correctly', () => {
  assert.equal(experienceLabel(null), null)
  assert.equal(experienceLabel(0), 'New')
  assert.equal(experienceLabel(1), '1 Year')
  assert.equal(experienceLabel(6), '6 Years')
})

test('hasEnoughDataForTrend requires at least 2 ratings — a single rating is not a trend', () => {
  assert.equal(hasEnoughDataForTrend([]), false)
  assert.equal(hasEnoughDataForTrend(undefined), false)
  assert.equal(hasEnoughDataForTrend([{ rating: 5 }]), false)
  assert.equal(hasEnoughDataForTrend([{ rating: 5 }, { rating: 4 }]), true)
})
