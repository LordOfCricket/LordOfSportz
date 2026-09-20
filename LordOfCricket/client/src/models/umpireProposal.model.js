// Umpire Proposals — pure display helpers, mirroring umpireEarnings.model.js's
// convention (label/class lookups matching the backend's exact enum values).

export const QUICK_INCENTIVE_AMOUNTS = Object.freeze([50, 100, 200])

const PROPOSAL_STATUS_LABELS = {
  PENDING: 'Pending',
  ACCEPTED: 'Accepted',
  DECLINED: 'Declined',
  CANCELLED: 'Withdrawn',
  EXPIRED: 'No Longer Available',
}

export function proposalStatusLabel(status) {
  return PROPOSAL_STATUS_LABELS[status] || status
}

const PROPOSAL_STATUS_CLASSES = {
  PENDING: 'border-amber-400/30 bg-amber-500/10 text-amber-300',
  ACCEPTED: 'border-emerald-400/30 bg-emerald-500/10 text-emerald-300',
  DECLINED: 'border-rose-400/30 bg-rose-500/10 text-rose-300',
  CANCELLED: 'border-slate-400/30 bg-slate-500/10 text-slate-300',
  EXPIRED: 'border-slate-400/30 bg-slate-500/10 text-slate-300',
}

export function proposalStatusClasses(status) {
  return PROPOSAL_STATUS_CLASSES[status] || PROPOSAL_STATUS_CLASSES.PENDING
}
