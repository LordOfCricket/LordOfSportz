import test from 'node:test'
import assert from 'node:assert/strict'
import { createHandoff, redeemHandoff } from '../../services/ssoHandoff.service.js'

test('handoff code is one-time', () => {
  const { code } = createHandoff(7, 'karate')
  assert.equal(redeemHandoff(code, 'karate'), 7)
  assert.equal(redeemHandoff(code, 'karate'), null)
})

test('handoff code is bound to its audience and consumed on a wrong attempt', () => {
  const { code } = createHandoff(7, 'karate')
  assert.equal(redeemHandoff(code, 'cricket-mobile'), null)
  assert.equal(redeemHandoff(code, 'karate'), null)
})

test('handoff rejects unknown audiences, junk codes and expired codes', (t) => {
  assert.equal(createHandoff(7, 'evil'), null)
  assert.equal(redeemHandoff(undefined, 'karate'), null)
  assert.equal(redeemHandoff('x'.repeat(200), 'karate'), null)
  const { code } = createHandoff(9, 'karate')
  const later = Date.now() + 61 * 1000
  t.mock.method(Date, 'now', () => later)
  assert.equal(redeemHandoff(code, 'karate'), null)
})
