import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildTeamCard } from './buildTeamCard.js'

test('buildTeamCard: maps counts, losses excludes ties (never double-counted as a loss)', () => {
  const card = buildTeamCard({ id: 1, name: 'LOC Warriors', short_name: 'LOW', logo_url: null, squad_count: '9', match_count: '10', win_count: '6', tie_count: '1' })
  assert.equal(card.matchCount, 10)
  assert.equal(card.wins, 6)
  assert.equal(card.losses, 3) // 10 - 6 wins - 1 tie
  assert.equal(card.squadCount, 9)
})

test('buildTeamCard: a new team with zero matches/players never crashes and never goes negative', () => {
  const card = buildTeamCard({ id: 2, name: 'New Team', short_name: 'NEW', logo_url: null, squad_count: '0', match_count: '0', win_count: '0', tie_count: '0' })
  assert.equal(card.matchCount, 0)
  assert.equal(card.wins, 0)
  assert.equal(card.losses, 0)
  assert.equal(card.squadCount, 0)
})
