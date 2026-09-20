import sgMail from '@sendgrid/mail'
import { logger } from '../../utils/logger.js'

let configured = false

function ensureConfigured() {
  if (!configured) {
    sgMail.setApiKey(process.env.SENDGRID_API_KEY)
    configured = true
  }
}

export function isSendgridConfigured() {
  return Boolean(process.env.SENDGRID_API_KEY && process.env.SENDGRID_FROM_EMAIL)
}

// SendGrid is a "dumb" delivery channel here — LOC generates, hashes, and
// verifies the code itself (see services/otp.service.js); SendGrid only
// sends the email containing the code LOC already decided on.
export async function sendSendgridOtp({ identifier, code }) {
  ensureConfigured()
  try {
    await sgMail.send({
      to: identifier,
      from: process.env.SENDGRID_FROM_EMAIL,
      subject: 'Your Lord Of Cricket login code',
      text: `Your login code is ${code}. It expires shortly. Never share this code with anyone.`,
      html: `<p>Your login code is <strong>${code}</strong>.</p><p>It expires shortly. Never share this code with anyone.</p>`,
    })
    return { delivered: true, provider: 'sendgrid' }
  } catch (err) {
    logger.error('SendGrid OTP delivery failed', { error: err.message })
    throw err
  }
}
