// Umpire Intelligence & Scale 2.0, Workstream K — display helpers for the
// backend's deterministic STAFFING_STATUS values (domain/umpireRecommendation/
// staffingForecast.js). Pure label/style lookups, mirroring
// umpireEarnings.model.js's paymentStatusLabel/paymentStatusClasses convention.

const LABELS = {
  FULLY_STAFFED: 'Fully staffed',
  NEEDS_ATTENTION: 'Needs attention',
  OPEN: 'Open',
  NOT_REQUIRED: 'No umpires required',
}

export function staffingForecastLabel(status) {
  return LABELS[status] || status
}

const CLASSES = {
  FULLY_STAFFED: 'border-emerald-400/30 bg-emerald-500/10 text-emerald-300',
  NEEDS_ATTENTION: 'border-rose-400/30 bg-rose-500/10 text-rose-300',
  OPEN: 'border-sky-400/30 bg-sky-500/10 text-sky-300',
  NOT_REQUIRED: 'border-slate-400/30 bg-slate-500/10 text-slate-300',
}

export function staffingForecastClasses(status) {
  return CLASSES[status] || CLASSES.OPEN
}
