// Phase 7 — isValidHttpUrl is the one function in this file with no
// existing test coverage (the others are exercised indirectly through
// registration/staff-creation integration tests); added alongside the
// security fix that introduced its only two call sites (amenity.controller.js
// /groundPhoto.controller.js's "add by URL" endpoints).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isValidHttpUrl } from './validation.js'

test('isValidHttpUrl accepts http and https URLs', () => {
  assert.equal(isValidHttpUrl('https://example.test/photo.jpg'), true)
  assert.equal(isValidHttpUrl('http://example.test/photo.jpg'), true)
})

test('isValidHttpUrl rejects non-http(s) schemes, including ones that could be persisted and later rendered unsafely', () => {
  assert.equal(isValidHttpUrl('javascript:alert(1)'), false)
  assert.equal(isValidHttpUrl('data:text/html,<script>alert(1)</script>'), false)
  assert.equal(isValidHttpUrl('ftp://example.test/x.jpg'), false)
  assert.equal(isValidHttpUrl('file:///etc/passwd'), false)
})

test('isValidHttpUrl rejects malformed input and non-strings without throwing', () => {
  assert.equal(isValidHttpUrl('not-a-url'), false)
  assert.equal(isValidHttpUrl(''), false)
  assert.equal(isValidHttpUrl(null), false)
  assert.equal(isValidHttpUrl(undefined), false)
  assert.equal(isValidHttpUrl(123), false)
})
