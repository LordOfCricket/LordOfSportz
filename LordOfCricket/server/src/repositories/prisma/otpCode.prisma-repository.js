import { prisma } from '../../config/prisma.js'

// Phase 3 — otp_codes is a brand-new table with no existing raw-SQL model to
// preserve compatibility with (see docs/DATABASE.md's Phase 2A note on why
// Prisma is the right tool for genuinely new tables, unlike `users`).

export async function createOtpCode({ identifier, identifierType, purpose = 'LOGIN', provider, otpHash, expiresAt, maxAttempts, userId = null, metadata = null }) {
  return prisma.otp_codes.create({
    data: {
      identifier,
      identifier_type: identifierType,
      purpose,
      provider,
      otp_hash: otpHash,
      expires_at: expiresAt,
      max_attempts: maxAttempts,
      user_id: userId,
      metadata,
    },
  })
}

export async function findPendingOtpForIdentifier(identifier, purpose = 'LOGIN') {
  return prisma.otp_codes.findFirst({
    where: { identifier, purpose, status: 'PENDING' },
    orderBy: { created_at: 'desc' },
  })
}

// Called right before issuing a new OTP — a fresh request always
// supersedes any still-pending one for the same identifier+purpose, so a
// stale code can never be used to satisfy a later request.
export async function invalidatePendingForIdentifier(identifier, purpose = 'LOGIN') {
  await prisma.otp_codes.updateMany({
    where: { identifier, purpose, status: 'PENDING' },
    data: { status: 'EXPIRED' },
  })
}

export async function incrementAttempts(id) {
  return prisma.otp_codes.update({ where: { id }, data: { attempts: { increment: 1 } } })
}

export async function markVerified(id, userId) {
  return prisma.otp_codes.update({ where: { id }, data: { status: 'VERIFIED', verified_at: new Date(), user_id: userId } })
}

export async function markLocked(id) {
  return prisma.otp_codes.update({ where: { id }, data: { status: 'LOCKED' } })
}

// Identifier-scoped request rate limiting (§9's "not just IP" requirement)
// — shared across every backend replica because it's a real Postgres read,
// not in-memory state, so it works correctly under horizontal scaling.
export async function countRecentRequestsForIdentifier(identifier, sinceDate) {
  return prisma.otp_codes.count({ where: { identifier, created_at: { gte: sinceDate } } })
}

// `purpose` is optional here (unlike the other lookups above) — verification
// (otp.service.js#verifyOtp) doesn't know in advance whether the pending
// code was requested via LOGIN, REGISTER_PLAYER, or REGISTER_UMPIRE (the
// same POST /auth/verify-otp endpoint serves all three, branching on the
// returned row's `purpose` afterward — see otpAuth.service.js), so omitting
// it finds the most recent code for the identifier across every purpose.
// Request-time callers (cooldown/invalidate) still pass a purpose so the
// three flows don't interfere with each other's pending codes.
export async function findMostRecentForIdentifier(identifier, purpose) {
  return prisma.otp_codes.findFirst({ where: purpose ? { identifier, purpose } : { identifier }, orderBy: { created_at: 'desc' } })
}
