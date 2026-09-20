import { changePassword } from '../services/passwordChange.service.js'
import { OtpAuthError } from '../domain/otpAuth/errors.js'

// SUPER_ADMIN Identity & Secure Provisioning feature — POST /auth/change-password.
// Deliberately requireAuth-only (never requireStaffRole) — this is the one
// route a force_password_change=true account must still be able to reach
// (see middlewares/auth.js#requireStaffRole's own comment on this).
export async function changePasswordHandler(req, res, next) {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body
    if (typeof currentPassword !== 'string' || typeof newPassword !== 'string' || typeof confirmPassword !== 'string') {
      return res.status(400).json({ message: 'currentPassword, newPassword, and confirmPassword are required.' })
    }
    await changePassword(req.user, req.session?.id, { currentPassword, newPassword, confirmPassword })
    res.json({ message: 'Password changed successfully.' })
  } catch (err) {
    if (err instanceof OtpAuthError) return next(err)
    next(err)
  }
}
