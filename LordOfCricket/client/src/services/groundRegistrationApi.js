import api from './api.js'

// Phase 4 — Ground Owner registration is now request/approval
// (ground_owner_requests), not immediate self-serve. Submitting no longer
// creates a ground or grants ownership — a super_admin must approve first.
export async function submitGroundRegistration(payload) {
  const { data } = await api.post('/grounds', payload)
  return data.request
}

// Public reference-id status check — no login required, matches what the
// wizard's success screen shows the applicant after submitting.
export async function fetchGroundRegistrationStatus(publicRequestId) {
  const { data } = await api.get(`/ground-owner-requests/status/${publicRequestId}`)
  return data.request
}

// Ground Registration feature — choose-from-device upload for one featured/
// gallery photo. Returns just the Cloudinary reference (no DB row yet — see
// groundOwnerRequest.controller.js#uploadPhoto's own comment on why).
export async function uploadRegistrationPhoto(file) {
  const formData = new FormData()
  formData.append('photo', file)
  const { data } = await api.post('/ground-owner-requests/photos', formData)
  return data
}

export async function fetchAmenityCatalog() {
  const { data } = await api.get('/ground-owner-requests/amenity-catalog')
  return data.amenities
}

// Authenticated Ground Owner adding/verifying a missing contact value —
// only reached when the account doesn't already have both email and phone
// verified (the New Signup Flow's own dual-verification already covers the
// common case).
export async function sendContactVerificationCode(identifier) {
  const { data } = await api.post('/ground-owner-requests/contact-verification/send-code', { identifier })
  return data
}

export async function verifyContactVerificationCode(identifier, code) {
  const { data } = await api.post('/ground-owner-requests/contact-verification/verify-code', { identifier, code })
  return data.user
}

// "My Ground Registrations" (§20/§21) — authenticated, scoped server-side
// to the caller's own submissions.
export async function fetchMyGroundRegistrations() {
  const { data } = await api.get('/ground-owner-requests/mine')
  return data.requests
}

export async function fetchMyGroundRegistrationDetail(publicRequestId) {
  const { data } = await api.get(`/ground-owner-requests/${publicRequestId}/mine`)
  return data.request
}

// Edit & Resubmit (§25) — only reachable from REJECTED/MORE_INFORMATION_REQUIRED.
export async function resubmitGroundRegistration(publicRequestId, payload) {
  const { data } = await api.put(`/ground-owner-requests/${publicRequestId}`, payload)
  return data.request
}

// Non-logged-in "find my registrations" (§22) — OTP-gated, reuses the
// existing OTP infrastructure server-side.
export async function requestLookupCode(identifier) {
  const { data } = await api.post('/ground-owner-requests/lookup/request-code', { identifier })
  return data
}

export async function verifyLookupCode(identifier, code) {
  const { data } = await api.post('/ground-owner-requests/lookup/verify', { identifier, code })
  return data.requests
}

// Admin review queue (super_admin only).
// SUPER_ADMIN Identity & Secure Provisioning feature — §7 status filter
// tabs. `status` is optional; omitting it returns every request regardless
// of status (the backend's existing listRequests(status) behavior), which
// remains this function's default so existing callers are unaffected.
export async function fetchPendingGroundRegistrations(status) {
  const { data } = await api.get('/ground-owner-requests', { params: status ? { status } : undefined })
  return data.requests
}

export async function approveGroundRegistration(publicRequestId) {
  const { data } = await api.post(`/ground-owner-requests/${publicRequestId}/approve`)
  return data
}

export async function rejectGroundRegistration(publicRequestId, reason) {
  const { data } = await api.post(`/ground-owner-requests/${publicRequestId}/reject`, { reason })
  return data.request
}

export async function requestGroundRegistrationInformation(publicRequestId, notes) {
  const { data } = await api.post(`/ground-owner-requests/${publicRequestId}/request-information`, { notes })
  return data.request
}
