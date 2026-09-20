// Pre-Phase-11 cleanup — security fix verification. jwt.js used to silently
// fall back to a hardcoded, publicly-known secret ('dev-only-insecure-
// secret-change-me') whenever JWT_SECRET was unset, with no distinction
// between dev and production. A misconfigured production deployment missing
// JWT_SECRET would have signed real login sessions with a secret anyone can
// read in this repository, letting an attacker forge valid tokens for any
// user. Fixed: the module now refuses to load in production without a real
// JWT_SECRET. Dev/test behavior (JWT_SECRET set, or NODE_ENV !== production)
// is unchanged.
//
// Each case dynamically imports jwt.js with a cache-busting query string —
// Node caches ES modules by specifier, so re-importing the bare path would
// just return the first run's already-evaluated module.
import { test } from 'node:test'
import assert from 'node:assert/strict'

async function freshImport() {
  return import(`./jwt.js?t=${Date.now()}-${Math.random()}`)
}

test('production with no JWT_SECRET refuses to load, never falls back to the known dev secret', async () => {
  const prevEnv = process.env.NODE_ENV
  const prevSecret = process.env.JWT_SECRET
  process.env.NODE_ENV = 'production'
  delete process.env.JWT_SECRET
  try {
    await assert.rejects(() => freshImport(), /JWT_SECRET/)
  } finally {
    process.env.NODE_ENV = prevEnv
    if (prevSecret === undefined) delete process.env.JWT_SECRET
    else process.env.JWT_SECRET = prevSecret
  }
})

test('production WITH a real JWT_SECRET loads normally and signs/verifies', async () => {
  const prevEnv = process.env.NODE_ENV
  const prevSecret = process.env.JWT_SECRET
  process.env.NODE_ENV = 'production'
  process.env.JWT_SECRET = 'a-real-production-secret'
  try {
    const mod = await freshImport()
    const token = mod.signToken({ userId: 1 })
    assert.equal(mod.verifyToken(token).userId, 1)
  } finally {
    process.env.NODE_ENV = prevEnv
    if (prevSecret === undefined) delete process.env.JWT_SECRET
    else process.env.JWT_SECRET = prevSecret
  }
})

test('development with no JWT_SECRET still works (existing dev convenience, unchanged)', async () => {
  const prevEnv = process.env.NODE_ENV
  const prevSecret = process.env.JWT_SECRET
  process.env.NODE_ENV = 'development'
  delete process.env.JWT_SECRET
  try {
    const mod = await freshImport()
    const token = mod.signToken({ userId: 7 })
    assert.equal(mod.verifyToken(token).userId, 7)
  } finally {
    process.env.NODE_ENV = prevEnv
    if (prevSecret === undefined) delete process.env.JWT_SECRET
    else process.env.JWT_SECRET = prevSecret
  }
})
