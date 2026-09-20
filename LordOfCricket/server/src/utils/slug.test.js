import { test } from 'node:test'
import assert from 'node:assert/strict'
import { slugify } from './slug.js'

test('slugify: lowercases and hyphenates spaces', () => {
  assert.equal(slugify('SS Cricket Ground'), 'ss-cricket-ground')
})

test('slugify: strips accents after normalization', () => {
  assert.equal(slugify('Café Ground'), 'cafe-ground')
})

test('slugify: collapses punctuation/multiple spaces into a single hyphen', () => {
  assert.equal(slugify('Greenfield!!  Ground__Club'), 'greenfield-ground-club')
})

test('slugify: trims leading/trailing hyphens', () => {
  assert.equal(slugify('  -Ground- '), 'ground')
})

test('slugify: preserves numbers', () => {
  assert.equal(slugify('Ground 42'), 'ground-42')
})

test('slugify: empty/whitespace-only input produces an empty string, never throws', () => {
  assert.equal(slugify(''), '')
  assert.equal(slugify('   '), '')
})

test('slugify: already-slug-shaped input is unchanged', () => {
  assert.equal(slugify('already-a-slug'), 'already-a-slug')
})
