// Umpire Communication & Commercial 2.0 — pure helpers for fee/earnings/
// payment-status display, mirroring umpireReputation.model.js's convention
// (label lookups, matching the backend's exact enum values).

export const PAYMENT_STATUSES = Object.freeze(['PENDING', 'APPROVED', 'PAID', 'FAILED', 'CANCELLED'])

const PAYMENT_STATUS_LABELS = {
  PENDING: 'Pending',
  APPROVED: 'Approved',
  PAID: 'Paid',
  FAILED: 'Failed',
  CANCELLED: 'Cancelled',
}

export function paymentStatusLabel(status) {
  return PAYMENT_STATUS_LABELS[status] || status
}

const PAYMENT_STATUS_CLASSES = {
  PENDING: 'border-amber-400/30 bg-amber-500/10 text-amber-300',
  APPROVED: 'border-sky-400/30 bg-sky-500/10 text-sky-300',
  PAID: 'border-emerald-400/30 bg-emerald-500/10 text-emerald-300',
  FAILED: 'border-rose-400/30 bg-rose-500/10 text-rose-300',
  CANCELLED: 'border-slate-400/30 bg-slate-500/10 text-slate-300',
}

export function paymentStatusClasses(status) {
  return PAYMENT_STATUS_CLASSES[status] || PAYMENT_STATUS_CLASSES.PENDING
}

// Real currency amounts arrive as NUMERIC-typed strings from the backend
// (e.g. "800.00") — Number() them for display, never parseFloat truncation
// tricks, and never re-derive/guess a value the server didn't send.
export function formatAmount(amount, currency = 'INR') {
  if (amount == null) return null
  const symbol = currency === 'INR' ? '₹' : `${currency} `
  return `${symbol}${Number(amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
