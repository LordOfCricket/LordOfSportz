import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pickTopRunScorer, pickTopWicketTaker } from './teamTopPerformers.js'

test('pickTopRunScorer: highest runs wins', () => {
  const entries = [
    { player: { publicPlayerId: 'CVP-A', name: 'Alice' }, batting: { runs: 120, average: 40, strikeRate: 110 } },
    { player: { publicPlayerId: 'CVP-B', name: 'Bob' }, batting: { runs: 200, average: 50, strikeRate: 130 } },
  ]
  const top = pickTopRunScorer(entries)
  assert.equal(top.player.name, 'Bob')
  assert.equal(top.runs, 200)
})

test('pickTopRunScorer: tie-break by publicPlayerId ascending, deterministic', () => {
  const entries = [
    { player: { publicPlayerId: 'CVP-Z', name: 'Zed' }, batting: { runs: 100, average: 20, strikeRate: 90 } },
    { player: { publicPlayerId: 'CVP-A', name: 'Alice' }, batting: { runs: 100, average: 25, strikeRate: 95 } },
  ]
  const top = pickTopRunScorer(entries)
  assert.equal(top.player.publicPlayerId, 'CVP-A')
})

test('pickTopRunScorer: no eligible entries -> null, never a fake zero-run winner', () => {
  assert.equal(pickTopRunScorer([]), null)
  assert.equal(pickTopRunScorer([{ player: { publicPlayerId: 'CVP-A' }, batting: { runs: 0 } }]), null)
})

test('pickTopWicketTaker: highest wickets wins, zero-wicket entries excluded', () => {
  const entries = [
    { player: { publicPlayerId: 'CVP-A', name: 'Alice' }, bowling: { wickets: 0, economy: 6, average: null } },
    { player: { publicPlayerId: 'CVP-B', name: 'Bob' }, bowling: { wickets: 14, economy: 5.2, average: 12.5 } },
  ]
  const top = pickTopWicketTaker(entries)
  assert.equal(top.player.name, 'Bob')
  assert.equal(top.wickets, 14)
})

test('pickTopWicketTaker: no eligible entries -> null', () => {
  assert.equal(pickTopWicketTaker([]), null)
})
