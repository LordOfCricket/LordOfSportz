import { sendConsoleOtp } from './consoleProvider.js'
import { sendTwilioVerification, checkTwilioVerification, isTwilioConfigured } from './twilioProvider.js'
import { sendSendgridOtp, isSendgridConfigured } from './sendgridProvider.js'

export { sendConsoleOtp, sendTwilioVerification, checkTwilioVerification, sendSendgridOtp }

// The one place that decides "which provider handles this identifier type
// right now" — everything above (auth controller, otp service) asks this
// instead of checking env vars itself, so swapping/adding a provider later
// never means touching more than this file and its own adapter module.
export function resolveProvider(identifierType) {
  if (identifierType === 'PHONE') {
    return isTwilioConfigured() ? 'TWILIO_VERIFY' : 'CONSOLE'
  }
  return isSendgridConfigured() ? 'SENDGRID' : 'CONSOLE'
}
