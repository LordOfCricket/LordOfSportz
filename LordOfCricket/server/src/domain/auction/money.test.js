import { test } from 'node:test'
import assert from 'node:assert/strict'
import { toPaise, fromPaise, isValidAmount, remainingPurse } from './money.js'

test('toPaise parses whole rupees and 1-2 decimal places exactly', () => {
  assert.equal(toPaise('100'), 10000)
  assert.equal(toPaise('100.5'), 10050)
  assert.equal(toPaise('100.50'), 10050)
  assert.equal(toPaise('0.01'), 1)
})

test('toPaise accepts a Prisma Decimal (an object with toString), not just a string', () => {
  const decimalLike = { toString: () => '1500.25' }
  assert.equal(toPaise(decimalLike), 150025)
})

test('toPaise rejects more than 2 decimal places rather than silently rounding', () => {
  assert.equal(toPaise('100.999'), null)
  assert.equal(toPaise('0.001'), null)
})

test('toPaise rejects negatives, blanks, and non-numeric junk', () => {
  assert.equal(toPaise('-5'), null)
  assert.equal(toPaise(''), null)
  assert.equal(toPaise('   '), null)
  assert.equal(toPaise('abc'), null)
  assert.equal(toPaise('1e5'), null)
  assert.equal(toPaise('1,000'), null)
})

test('toPaise rejects null/undefined rather than treating them as zero', () => {
  assert.equal(toPaise(null), null)
  assert.equal(toPaise(undefined), null)
})

test('toPaise rejects Infinity and NaN', () => {
  assert.equal(toPaise(Infinity), null)
  assert.equal(toPaise(NaN), null)
})

// The whole reason this module exists: 0.1 + 0.2 !== 0.3 in float arithmetic,
// but 10 + 20 === 30 in paise.
test('paise arithmetic is exact where float arithmetic would drift', () => {
  const sum = toPaise('0.10') + toPaise('0.20')
  assert.equal(sum, 30)
  assert.equal(fromPaise(sum), '0.30')
})

test('fromPaise round-trips through toPaise', () => {
  for (const value of ['0.01', '1.00', '99.99', '1500.25', '9999999999.99']) {
    assert.equal(fromPaise(toPaise(value)), value)
  }
})

test('fromPaise pads the paise component to two digits', () => {
  assert.equal(fromPaise(5), '0.05')
  assert.equal(fromPaise(100), '1.00')
  assert.equal(fromPaise(10050), '100.50')
})

test('isValidAmount requires a strictly positive amount — zero is not a valid purse or bid', () => {
  assert.equal(isValidAmount('0'), false)
  assert.equal(isValidAmount('0.00'), false)
  assert.equal(isValidAmount('0.01'), true)
})

test('isValidAmount rejects what toPaise rejects', () => {
  assert.equal(isValidAmount('-1'), false)
  assert.equal(isValidAmount('abc'), false)
  assert.equal(isValidAmount(null), false)
  assert.equal(isValidAmount('1.234'), false)
})

test('remainingPurse subtracts exactly, in paise', () => {
  assert.equal(remainingPurse('1000.00', '250.50'), 74950)
  assert.equal(fromPaise(remainingPurse('1000.00', '250.50')), '749.50')
})

test('remainingPurse of a fully-spent purse is exactly zero', () => {
  assert.equal(remainingPurse('1000.00', '1000.00'), 0)
})

test('remainingPurse returns null on unparseable input, never a misleading zero', () => {
  assert.equal(remainingPurse('abc', '100'), null)
  assert.equal(remainingPurse('100', null), null)
})
