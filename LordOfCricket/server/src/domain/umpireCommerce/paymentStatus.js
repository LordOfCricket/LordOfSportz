// Umpire Communication & Commercial 2.0 — pure, zero-I/O payment-status
// state machine. No payment gateway exists anywhere in this codebase
// (confirmed by audit), so FAILED is reachable only as a manual Ground
// Owner override ("this payment failed outside the app"), never an
// automated gateway callback. PAID/CANCELLED/FAILED are terminal — no
// transition leaves them, mirroring Workstream R's immutability
// requirement extended from the fee amount to payment status itself.
export const PAYMENT_STATUSES = Object.freeze(['PENDING', 'APPROVED', 'PAID', 'FAILED', 'CANCELLED'])

const TERMINAL = Object.freeze(new Set(['PAID', 'FAILED', 'CANCELLED']))

const ALLOWED_TRANSITIONS = Object.freeze({
  PENDING: Object.freeze(new Set(['APPROVED', 'PAID', 'CANCELLED', 'FAILED'])),
  APPROVED: Object.freeze(new Set(['PAID', 'CANCELLED', 'FAILED'])),
  PAID: Object.freeze(new Set()),
  FAILED: Object.freeze(new Set()),
  CANCELLED: Object.freeze(new Set()),
})

export function isValidPaymentStatusTransition(from, to) {
  if (!PAYMENT_STATUSES.includes(from) || !PAYMENT_STATUSES.includes(to)) return false
  if (from === to) return false
  return ALLOWED_TRANSITIONS[from].has(to)
}

export function isTerminalPaymentStatus(status) {
  return TERMINAL.has(status)
}
