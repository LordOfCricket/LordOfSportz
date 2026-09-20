// Pure helpers for the Ground Registration feature — status labels/timeline
// derivation kept out of components so they're independently testable, same
// convention as player.model.js/roleRedirect.model.js elsewhere in this app.

export const STATUS_LABELS = {
  PENDING: 'Pending Approval',
  UNDER_REVIEW: 'Under LOC Review',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  MORE_INFORMATION_REQUIRED: 'Changes Required',
}

export function statusLabel(status) {
  return STATUS_LABELS[status] || status
}

// Whether an Edit & Resubmit action should be offered — only the two
// decided-but-fixable states (never PENDING/UNDER_REVIEW/APPROVED).
export function canResubmit(status) {
  return status === 'REJECTED' || status === 'MORE_INFORMATION_REQUIRED'
}

const TIMELINE_STEPS = ['SUBMITTED', 'REVIEW', 'APPROVAL', 'PUBLISHED']

// Maps a request's real status onto the 4-stage timeline the status page
// draws (§24) — 'done' | 'current' | 'upcoming' per step. REJECTED and
// MORE_INFORMATION_REQUIRED both stop the timeline at REVIEW (approval
// never happened), never silently advance past it.
export function timelineForStatus(status) {
  const doneThroughIndex = {
    PENDING: 0,
    UNDER_REVIEW: 1,
    APPROVED: 3,
    REJECTED: 1,
    MORE_INFORMATION_REQUIRED: 1,
  }[status]
  if (doneThroughIndex === undefined) return TIMELINE_STEPS.map((step) => ({ step, state: 'upcoming' }))

  return TIMELINE_STEPS.map((step, i) => {
    if (status === 'APPROVED') return { step, state: i <= doneThroughIndex ? 'done' : 'upcoming' }
    if (i < doneThroughIndex) return { step, state: 'done' }
    if (i === doneThroughIndex) return { step, state: 'current' }
    return { step, state: 'upcoming' }
  })
}

export const WIZARD_STEPS = ['Contact', 'Ground Information', 'Featured Photos', 'Gallery', 'Amenities', 'Location', 'Review & Submit']

// Composes the exact payload shape the backend's submitRequest/
// resubmitRequest validation expects, from the wizard hook's own form
// state — one place defines this mapping so create and resubmit (which
// both call it) can never drift apart.
export function buildSubmissionPayload(form) {
  return {
    name: form.groundName.trim(),
    description: form.about.trim(),
    addressLine: form.addressLine.trim(),
    city: form.city.trim(),
    state: form.state.trim(),
    postalCode: form.postalCode.trim() || undefined,
    country: form.country.trim() || undefined,
    phone: form.groundPhone.trim(),
    email: form.groundEmail.trim() || undefined,
    website: form.website.trim() || undefined,
    latitude: form.latitude ?? undefined,
    longitude: form.longitude ?? undefined,
    agreedToTerms: form.agreedToTerms,
    featuredPhotos: form.featuredPhotos.filter(Boolean).map((p) => ({ url: p.url, publicId: p.publicId })),
    galleryPhotos: form.galleryPhotos.map((p) => ({ url: p.url, publicId: p.publicId })),
    amenityKeys: form.amenityKeys,
  }
}
