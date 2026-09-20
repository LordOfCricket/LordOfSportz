// Run with: node --test src/models/player.model.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { composeBowlingStyle, decomposeBowlingStyle } from './player.model.js'

test('decomposeBowlingStyle: null/undefined means "not answered yet", distinct from NONE', () => {
  assert.deepEqual(decomposeBowlingStyle(null), { bowls: null, arm: null, type: null, spinStyle: null })
  assert.deepEqual(decomposeBowlingStyle(undefined), { bowls: null, arm: null, type: null, spinStyle: null })
})

test('decomposeBowlingStyle: NONE means an explicit "No"', () => {
  assert.deepEqual(decomposeBowlingStyle('NONE'), { bowls: false, arm: null, type: null, spinStyle: null })
})

test('decomposeBowlingStyle: pace styles decompose into arm + type, no spinStyle', () => {
  assert.deepEqual(decomposeBowlingStyle('RIGHT_ARM_FAST'), { bowls: true, arm: 'RIGHT', type: 'FAST', spinStyle: null })
  assert.deepEqual(decomposeBowlingStyle('LEFT_ARM_MEDIUM'), { bowls: true, arm: 'LEFT', type: 'MEDIUM', spinStyle: null })
})

test('decomposeBowlingStyle: spin styles decompose into arm + type SPIN + the specific spinStyle', () => {
  assert.deepEqual(decomposeBowlingStyle('RIGHT_ARM_OFF_BREAK'), { bowls: true, arm: 'RIGHT', type: 'SPIN', spinStyle: 'RIGHT_ARM_OFF_BREAK' })
  assert.deepEqual(decomposeBowlingStyle('LEFT_ARM_WRIST_SPIN'), { bowls: true, arm: 'LEFT', type: 'SPIN', spinStyle: 'LEFT_ARM_WRIST_SPIN' })
})

test('composeBowlingStyle: bowls=false always yields NONE regardless of other fields', () => {
  assert.equal(composeBowlingStyle({ bowls: false, arm: 'RIGHT', type: 'FAST', spinStyle: null }), 'NONE')
})

test('composeBowlingStyle: bowls not yet answered yields null, not a guess', () => {
  assert.equal(composeBowlingStyle({ bowls: null, arm: null, type: null, spinStyle: null }), null)
  assert.equal(composeBowlingStyle({ bowls: true, arm: null, type: null, spinStyle: null }), null)
})

test('composeBowlingStyle: Fast/Medium compose with arm into the matching enum value', () => {
  assert.equal(composeBowlingStyle({ bowls: true, arm: 'RIGHT', type: 'FAST', spinStyle: null }), 'RIGHT_ARM_FAST')
  assert.equal(composeBowlingStyle({ bowls: true, arm: 'LEFT', type: 'FAST', spinStyle: null }), 'LEFT_ARM_FAST')
  assert.equal(composeBowlingStyle({ bowls: true, arm: 'RIGHT', type: 'MEDIUM', spinStyle: null }), 'RIGHT_ARM_MEDIUM')
  assert.equal(composeBowlingStyle({ bowls: true, arm: 'LEFT', type: 'MEDIUM', spinStyle: null }), 'LEFT_ARM_MEDIUM')
})

test('composeBowlingStyle: Spin passes through whichever spinStyle was chosen', () => {
  assert.equal(composeBowlingStyle({ bowls: true, arm: 'RIGHT', type: 'SPIN', spinStyle: 'RIGHT_ARM_LEG_BREAK' }), 'RIGHT_ARM_LEG_BREAK')
  assert.equal(composeBowlingStyle({ bowls: true, arm: 'LEFT', type: 'SPIN', spinStyle: 'LEFT_ARM_ORTHODOX' }), 'LEFT_ARM_ORTHODOX')
})

test('composeBowlingStyle: Spin selected but spin type not yet chosen yields null, not a wrong guess', () => {
  assert.equal(composeBowlingStyle({ bowls: true, arm: 'RIGHT', type: 'SPIN', spinStyle: null }), null)
})

test('compose/decompose round-trip for every real bowling_style enum value', () => {
  const values = [
    'RIGHT_ARM_FAST',
    'RIGHT_ARM_MEDIUM',
    'RIGHT_ARM_OFF_BREAK',
    'RIGHT_ARM_LEG_BREAK',
    'LEFT_ARM_FAST',
    'LEFT_ARM_MEDIUM',
    'LEFT_ARM_ORTHODOX',
    'LEFT_ARM_WRIST_SPIN',
    'NONE',
  ]
  for (const value of values) {
    assert.equal(composeBowlingStyle(decomposeBowlingStyle(value)), value, `round-trip failed for ${value}`)
  }
})
