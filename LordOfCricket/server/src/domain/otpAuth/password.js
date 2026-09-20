// Password login/reset — pure domain logic, no pg/bcrypt/I/O, same
// convention as otp.js (independently unit-testable, colocated test file).
//
// Policy: length only, no forced character-class complexity. No policy
// existed anywhere in this codebase before this feature (staffAccount.
// service.js#createPlatformStaff hashes whatever a Super Admin types with
// zero validation) — this establishes a reasonable minimum rather than
// inheriting that gap. Length-over-complexity mirrors current guidance
// (NIST 800-63B) and this app's own "smallest reasonable policy" brief.
// Upper bound isn't arbitrary: bcrypt silently truncates/ignores input past
// 72 BYTES, so a 128-character cap (well under that for any realistic
// input, generous for passphrases) is enforced explicitly here rather than
// letting bcrypt silently drop the tail of an unusually long password.
export const PASSWORD_MIN_LENGTH = 8
export const PASSWORD_MAX_LENGTH = 128

export function validatePasswordPolicy(password) {
  if (typeof password !== 'string') return { valid: false, reason: 'Password is required.' }
  if (password.length < PASSWORD_MIN_LENGTH) {
    return { valid: false, reason: `Password must be at least ${PASSWORD_MIN_LENGTH} characters.` }
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    return { valid: false, reason: `Password must be at most ${PASSWORD_MAX_LENGTH} characters.` }
  }
  return { valid: true }
}
