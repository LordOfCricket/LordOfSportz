import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveProvider } from '../../services/otpProviders/index.js'

function withEnv(env, fn) {
  const prev = { ...process.env }
  Object.assign(process.env, env)
  try {
    return fn()
  } finally {
    for (const key of Object.keys(env)) {
      if (prev[key] === undefined) delete process.env[key]
      else process.env[key] = prev[key]
    }
  }
}

test('OTP_DEV_CONSOLE routes every identifier type to the console provider outside production', () => {
  withEnv({ OTP_DEV_CONSOLE: 'true', NODE_ENV: 'development' }, () => {
    assert.equal(resolveProvider('PHONE'), 'CONSOLE')
    assert.equal(resolveProvider('EMAIL'), 'CONSOLE')
  })
})

test('OTP_DEV_CONSOLE is ignored in production', () => {
  withEnv({ OTP_DEV_CONSOLE: 'true', NODE_ENV: 'production' }, () => {
    const devSwitchOn = resolveProvider('PHONE')
    withEnv({ OTP_DEV_CONSOLE: 'false' }, () => assert.equal(resolveProvider('PHONE'), devSwitchOn))
    // Without provider credentials the pre-existing fallback is CONSOLE, so assert the switch itself is inert:
    withEnv({ OTP_DEV_CONSOLE: 'false' }, () => {})
  })
})
