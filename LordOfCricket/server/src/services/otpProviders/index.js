import { sendConsoleOtp } from './consoleProvider.js'
import { sendTwilioVerification, checkTwilioVerification, isTwilioConfigured } from './twilioProvider.js'
import { sendSendgridOtp, isSendgridConfigured } from './sendgridProvider.js'

export { sendConsoleOtp, sendTwilioVerification, checkTwilioVerification, sendSendgridOtp }

// The one place that decides "which provider handles this identifier type
// right now" — everything above (auth controller, otp service) asks this
// instead of checking env vars itself, so swapping/adding a provider later
// never means touching more than this file and its own adapter module.
// Local/test opt-in: OTP_DEV_CONSOLE=true routes every OTP to the console provider (no Twilio/SendGrid
// call) so new accounts can be created without third-party verification. Hard-disabled in production.
const devConsoleOnly = () =>
  process.env.OTP_DEV_CONSOLE === 'true' && process.env.NODE_ENV !== 'production'

export function resolveProvider(identifierType) {
  if (devConsoleOnly()) return 'CONSOLE'
  if (identifierType === 'PHONE') {
    return isTwilioConfigured() ? 'TWILIO_VERIFY' : 'CONSOLE'
  }
  return isSendgridConfigured() ? 'SENDGRID' : 'CONSOLE'
}
