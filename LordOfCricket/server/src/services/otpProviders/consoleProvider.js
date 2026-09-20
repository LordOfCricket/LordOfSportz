import { maskIdentifier } from '../../domain/otpAuth/otp.js'

// Dev-mode fallback — same graceful-degradation pattern as the app's other
// optional integrations (Google Calendar, AI, Cloudinary): when real
// Twilio/SendGrid credentials aren't configured, this provider is used
// automatically instead so the OTP flow can be fully exercised locally
// without sending a real SMS/email.
//
// Deliberately does NOT go through utils/logger.js — that pipeline is what
// production log aggregation ships, and §18 of the brief is explicit that
// OTP values must never be logged. This uses the bare Node `console.log`
// instead, precisely so a repo-wide search for "logger." + OTP-adjacent
// code never turns up a code path that writes a real code into structured
// logs. Also hard-refuses to run in production at all — this must only ever
// be reachable when Twilio/SendGrid are unconfigured in a non-production
// environment (see otpProviders/index.js's selection logic, which this
// duplicates the check for as defense in depth, not as the only guard).
export async function sendConsoleOtp({ identifier, identifierType, code }) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Console OTP provider must never run in production — configure Twilio/SendGrid.')
  }

  console.log(`[dev-otp] ${identifierType} ${maskIdentifier(identifier, identifierType)} -> code: ${code}`)
  return { delivered: true, provider: 'console' }
}
