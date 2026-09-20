// Match Proposals — pure display helpers, mirroring umpireProposal.model.js's
// convention (label/class lookups matching the backend's exact enum values).

const PROPOSAL_STATUS_LABELS = {
  OPEN: 'Open',
  CONFIRMED: 'Accepted',
  CANCELLED: 'Withdrawn',
  EXPIRED: 'Expired',
}

export function proposalStatusLabel(status) {
  return PROPOSAL_STATUS_LABELS[status] || status
}

const PROPOSAL_STATUS_CLASSES = {
  OPEN: 'border-amber-400/30 bg-amber-500/10 text-amber-300',
  CONFIRMED: 'border-emerald-400/30 bg-emerald-500/10 text-emerald-300',
  CANCELLED: 'border-slate-400/30 bg-slate-500/10 text-slate-300',
  EXPIRED: 'border-slate-400/30 bg-slate-500/10 text-slate-300',
}

export function proposalStatusClasses(status) {
  return PROPOSAL_STATUS_CLASSES[status] || PROPOSAL_STATUS_CLASSES.OPEN
}
