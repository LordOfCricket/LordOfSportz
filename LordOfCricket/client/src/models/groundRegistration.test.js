// Run with: node --test src/models/groundRegistration.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { statusLabel, canResubmit, timelineForStatus, buildSubmissionPayload } from './groundRegistration.model.js'

test('statusLabel maps every known status, falls back to the raw value for an unknown one', () => {
  assert.equal(statusLabel('PENDING'), 'Pending Approval')
  assert.equal(statusLabel('MORE_INFORMATION_REQUIRED'), 'Changes Required')
  assert.equal(statusLabel('SOMETHING_NEW'), 'SOMETHING_NEW')
})

test('canResubmit is true only for REJECTED and MORE_INFORMATION_REQUIRED', () => {
  assert.equal(canResubmit('REJECTED'), true)
  assert.equal(canResubmit('MORE_INFORMATION_REQUIRED'), true)
  assert.equal(canResubmit('PENDING'), false)
  assert.equal(canResubmit('UNDER_REVIEW'), false)
  assert.equal(canResubmit('APPROVED'), false)
})

test('timelineForStatus: PENDING is current at SUBMITTED, everything after is upcoming', () => {
  const timeline = timelineForStatus('PENDING')
  assert.deepEqual(
    timeline.map((t) => t.state),
    ['current', 'upcoming', 'upcoming', 'upcoming'],
  )
})

test('timelineForStatus: UNDER_REVIEW marks SUBMITTED done, REVIEW current', () => {
  const timeline = timelineForStatus('UNDER_REVIEW')
  assert.deepEqual(
    timeline.map((t) => t.state),
    ['done', 'current', 'upcoming', 'upcoming'],
  )
})

test('timelineForStatus: APPROVED marks every step done, including PUBLISHED', () => {
  const timeline = timelineForStatus('APPROVED')
  assert.deepEqual(
    timeline.map((t) => t.state),
    ['done', 'done', 'done', 'done'],
  )
})

test('timelineForStatus: REJECTED and MORE_INFORMATION_REQUIRED both stop at REVIEW, never advance to APPROVAL/PUBLISHED', () => {
  assert.deepEqual(
    timelineForStatus('REJECTED').map((t) => t.state),
    ['done', 'current', 'upcoming', 'upcoming'],
  )
  assert.deepEqual(
    timelineForStatus('MORE_INFORMATION_REQUIRED').map((t) => t.state),
    ['done', 'current', 'upcoming', 'upcoming'],
  )
})

test('timelineForStatus: an unknown status is entirely upcoming, never guessed as progress', () => {
  assert.deepEqual(
    timelineForStatus('SOMETHING_NEW').map((t) => t.state),
    ['upcoming', 'upcoming', 'upcoming', 'upcoming'],
  )
})

function baseForm() {
  return {
    groundName: ' Greenfield Cricket Ground ',
    about: ' A great ground. ',
    addressLine: ' 12 Main Street ',
    city: ' Mumbai ',
    state: ' Maharashtra ',
    postalCode: ' 400001 ',
    country: ' India ',
    groundPhone: ' 9999999999 ',
    groundEmail: ' owner@example.com ',
    website: '',
    latitude: 19.076,
    longitude: 72.8777,
    agreedToTerms: true,
    featuredPhotos: [{ url: 'https://a', publicId: 'p1' }, null, { url: 'https://b', publicId: 'p2' }],
    galleryPhotos: [{ url: 'https://c', publicId: 'p3' }],
    amenityKeys: ['wifi', 'parking'],
  }
}

test('buildSubmissionPayload trims text fields and maps to the backend field names', () => {
  const payload = buildSubmissionPayload(baseForm())
  assert.equal(payload.name, 'Greenfield Cricket Ground')
  assert.equal(payload.description, 'A great ground.')
  assert.equal(payload.addressLine, '12 Main Street')
  assert.equal(payload.phone, '9999999999')
  assert.equal(payload.email, 'owner@example.com')
})

test('buildSubmissionPayload drops empty optional fields to undefined, not empty strings', () => {
  const payload = buildSubmissionPayload(baseForm())
  assert.equal(payload.website, undefined)
})

test('buildSubmissionPayload filters out unfilled featured photo slots (null) before sending', () => {
  const payload = buildSubmissionPayload(baseForm())
  assert.deepEqual(payload.featuredPhotos, [{ url: 'https://a', publicId: 'p1' }, { url: 'https://b', publicId: 'p2' }])
})

test('buildSubmissionPayload passes gallery photos and amenity keys through as-is', () => {
  const payload = buildSubmissionPayload(baseForm())
  assert.deepEqual(payload.galleryPhotos, [{ url: 'https://c', publicId: 'p3' }])
  assert.deepEqual(payload.amenityKeys, ['wifi', 'parking'])
})
