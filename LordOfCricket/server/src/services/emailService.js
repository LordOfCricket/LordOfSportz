import sgMail from '@sendgrid/mail'
import { logger } from '../utils/logger.js'

let configured = false

function ensureConfigured() {
  if (!configured) {
    sgMail.setApiKey(process.env.SENDGRID_API_KEY)
    configured = true
  }
}

export function isEmailConfigured() {
  return Boolean(process.env.SENDGRID_API_KEY && process.env.SENDGRID_FROM_EMAIL)
}

export async function sendGroundApprovalEmail({ recipientEmail, recipientName, temporaryPassword, loginUrl }) {
  ensureConfigured()
  try {
    const subject = 'Your Lord Of Cricket Ground Owner Account Has Been Approved'
    const text = `Dear ${recipientName},

Your ground registration request has been approved.

LOGIN DETAILS:
Email: ${recipientEmail}
Temporary Password: ${temporaryPassword}

Please log in at: ${loginUrl}

IMPORTANT: For security reasons, you must change your temporary password immediately after your first login. You will be prompted to do this before accessing your account.

If you did not request this account or have questions, please contact support.

Best regards,
Lord Of Cricket Team`

    const html = `<p>Dear <strong>${recipientName}</strong>,</p>
<p>Your ground registration request has been approved.</p>
<h3>LOGIN DETAILS:</h3>
<p>
  <strong>Email:</strong> ${recipientEmail}<br>
  <strong>Temporary Password:</strong> ${temporaryPassword}
</p>
<p><a href="${loginUrl}" style="background-color: #10b981; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px; display: inline-block;">Login to Your Account</a></p>
<p><strong style="color: #dc2626;">IMPORTANT:</strong> For security reasons, you must change your temporary password immediately after your first login. You will be prompted to do this before accessing your account.</p>
<p>If you did not request this account or have questions, please contact support.</p>
<p>Best regards,<br>Lord Of Cricket Team</p>`

    await sgMail.send({
      to: recipientEmail,
      from: process.env.SENDGRID_FROM_EMAIL,
      subject,
      text,
      html,
    })

    logger.info('Ground approval email sent', { recipientEmail, groundOwnerName: recipientName })
    return { delivered: true, provider: 'sendgrid', recipient: recipientEmail }
  } catch (err) {
    logger.error('Ground approval email delivery failed', { error: err.message, recipientEmail })
    throw err
  }
}

export async function sendPasswordRecoveryEmail({ recipientEmail, recipientName, temporaryPassword, loginUrl }) {
  ensureConfigured()
  try {
    const subject = 'Your Lord Of Cricket Account Password Recovery'
    const text = `Dear ${recipientName},

An administrator has initiated a password recovery for your Lord Of Cricket account.

LOGIN DETAILS:
Email: ${recipientEmail}
Temporary Password: ${temporaryPassword}

Please log in at: ${loginUrl}

IMPORTANT: For security reasons, you must change your temporary password immediately after your first login. You will be prompted to do this before accessing your account.

If you did not request this password recovery or have questions, please contact support immediately.

Best regards,
Lord Of Cricket Team`

    const html = `<p>Dear <strong>${recipientName}</strong>,</p>
<p>An administrator has initiated a password recovery for your Lord Of Cricket account.</p>
<h3>LOGIN DETAILS:</h3>
<p>
  <strong>Email:</strong> ${recipientEmail}<br>
  <strong>Temporary Password:</strong> ${temporaryPassword}
</p>
<p><a href="${loginUrl}" style="background-color: #10b981; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px; display: inline-block;">Login to Your Account</a></p>
<p><strong style="color: #dc2626;">IMPORTANT:</strong> For security reasons, you must change your temporary password immediately after your first login. You will be prompted to do this before accessing your account.</p>
<p>If you did not request this password recovery or have questions, please contact support immediately.</p>
<p>Best regards,<br>Lord Of Cricket Team</p>`

    await sgMail.send({
      to: recipientEmail,
      from: process.env.SENDGRID_FROM_EMAIL,
      subject,
      text,
      html,
    })

    logger.info('Password recovery email sent', { recipientEmail, userName: recipientName })
    return { delivered: true, provider: 'sendgrid', recipient: recipientEmail }
  } catch (err) {
    logger.error('Password recovery email delivery failed', { error: err.message, recipientEmail })
    throw err
  }
}
