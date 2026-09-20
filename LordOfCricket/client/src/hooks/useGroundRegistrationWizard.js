import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from './useAuth.js'
import { WIZARD_STEPS, buildSubmissionPayload } from '../models/groundRegistration.model.js'
import {
  uploadRegistrationPhoto,
  fetchAmenityCatalog,
  sendContactVerificationCode,
  verifyContactVerificationCode,
  submitGroundRegistration,
  resubmitGroundRegistration,
  fetchMyGroundRegistrationDetail,
} from '../services/groundRegistrationApi.js'

const EMPTY_FEATURED = () => Array(6).fill(null)

function emptyForm(user) {
  return {
    groundName: '',
    about: '',
    featuredPhotos: EMPTY_FEATURED(),
    galleryPhotos: [],
    amenityKeys: [],
    latitude: null,
    longitude: null,
    addressLine: '',
    city: '',
    state: '',
    postalCode: '',
    country: 'India',
    groundPhone: '',
    groundEmail: user?.email || '',
    website: '',
    agreedToTerms: false,
  }
}

// One hook, one place, all wizard state — same "single page/hook, step
// state, submit-at-the-end" shape already established by useSignupPage.js/
// usePlayerOnboarding.js in this codebase. `mode: 'create'` starts blank;
// `mode: 'edit'` (Edit & Resubmit after REJECTED/MORE_INFORMATION_REQUIRED)
// loads the existing request via GET .../mine and pre-fills everything,
// including already-uploaded photos and selected amenities — the brief's
// explicit "do not make them start from zero" requirement (§25).
//
// Photos are uploaded to Cloudinary the moment a slot/gallery file is
// picked (POST .../photos, no DB row yet) — nothing about the request
// itself is created server-side until the final Agree & Submit, which
// sends the complete, already-uploaded photo/amenity/field set in one
// atomic call (groundOwnerRequest.service.js#submitRequest /
// #resubmitRequest). This keeps the wizard's own "draft" entirely
// client-side (React state), matching the exact convention every other
// multi-step form in this app already uses, rather than inventing a
// server-side DRAFT status for ground_owner_requests.
export function useGroundRegistrationWizard({ mode = 'create', publicRequestId = null } = {}) {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [stepIndex, setStepIndex] = useState(0)
  const [form, setForm] = useState(() => emptyForm(user))
  const [catalog, setCatalog] = useState([])
  const [loaded, setLoaded] = useState(mode === 'create')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [submittedRequest, setSubmittedRequest] = useState(null)

  // Contact verification sub-state — "reuse existing verification" (§3):
  // req.user.email/phone presence IS the verified signal (every path that
  // sets either column already required OTP proof — signup, or the
  // contact-verification step below), never re-checked with a fresh code
  // just because this form exists.
  const [emailVerifiedNow, setEmailVerifiedNow] = useState(Boolean(user?.email))
  const [phoneVerifiedNow, setPhoneVerifiedNow] = useState(Boolean(user?.phone))
  const [emailDraft, setEmailDraft] = useState('')
  const [phoneDraft, setPhoneDraft] = useState('')
  const [emailCodeSent, setEmailCodeSent] = useState(false)
  const [phoneCodeSent, setPhoneCodeSent] = useState(false)
  const [contactBusy, setContactBusy] = useState(false)
  const [contactError, setContactError] = useState({ email: '', phone: '' })

  useEffect(() => {
    fetchAmenityCatalog().then(setCatalog).catch(() => setCatalog([]))
  }, [])

  useEffect(() => {
    if (mode !== 'edit' || !publicRequestId) return
    let cancelled = false
    fetchMyGroundRegistrationDetail(publicRequestId)
      .then((request) => {
        if (cancelled) return
        setForm({
          groundName: request.groundName || '',
          about: request.groundDescription || '',
          featuredPhotos: (() => {
            const slots = EMPTY_FEATURED()
            request.photos?.filter((p) => p.isFeatured).forEach((p, i) => { if (i < 6) slots[i] = { url: p.imageUrl, publicId: p.publicId } })
            return slots
          })(),
          galleryPhotos: request.photos?.filter((p) => !p.isFeatured).map((p) => ({ url: p.imageUrl, publicId: p.publicId })) || [],
          amenityKeys: request.amenityKeys || [],
          latitude: request.latitude,
          longitude: request.longitude,
          addressLine: request.addressLine || '',
          city: request.city || '',
          state: request.state || '',
          postalCode: request.postalCode || '',
          country: request.country || 'India',
          groundPhone: request.groundPhone || '',
          groundEmail: request.groundEmail || '',
          website: request.groundWebsite || '',
          agreedToTerms: false,
        })
      })
      .finally(() => { if (!cancelled) setLoaded(true) })
    return () => { cancelled = true }
  }, [mode, publicRequestId])

  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }))

  // --- Contact verification ---
  const sendCode = async (which) => {
    const draft = which === 'email' ? emailDraft : phoneDraft
    setContactError((e) => ({ ...e, [which]: '' }))
    setContactBusy(true)
    try {
      await sendContactVerificationCode(draft.trim())
      if (which === 'email') setEmailCodeSent(true)
      else setPhoneCodeSent(true)
    } catch (err) {
      setContactError((e) => ({ ...e, [which]: err.response?.data?.message || 'Could not send the code. Please try again.' }))
    } finally {
      setContactBusy(false)
    }
  }

  const verifyCode = async (which, code) => {
    const draft = which === 'email' ? emailDraft : phoneDraft
    setContactError((e) => ({ ...e, [which]: '' }))
    setContactBusy(true)
    try {
      const updatedUser = await verifyContactVerificationCode(draft.trim(), code)
      if (which === 'email') {
        setEmailVerifiedNow(true)
        setForm((f) => ({ ...f, groundEmail: f.groundEmail || updatedUser.email }))
      } else {
        setPhoneVerifiedNow(true)
      }
    } catch (err) {
      setContactError((e) => ({ ...e, [which]: err.response?.data?.message || 'Invalid or expired code.' }))
    } finally {
      setContactBusy(false)
    }
  }

  // --- Featured photos (exactly 6 fixed slots) ---
  const [featuredError, setFeaturedError] = useState('')
  const uploadFeaturedSlot = async (index, file, clientError) => {
    if (clientError) {
      setFeaturedError(clientError)
      return
    }
    setFeaturedError('')
    try {
      const uploaded = await uploadRegistrationPhoto(file)
      setForm((f) => {
        const next = [...f.featuredPhotos]
        next[index] = uploaded
        return { ...f, featuredPhotos: next }
      })
    } catch (err) {
      setFeaturedError(err.response?.data?.message || 'Upload failed. Try a different photo.')
    }
  }
  const removeFeaturedSlot = (index) => {
    setForm((f) => {
      const next = [...f.featuredPhotos]
      next[index] = null
      return { ...f, featuredPhotos: next }
    })
  }

  // --- Gallery (optional, variable length) ---
  const addGalleryPhoto = async (file) => {
    const uploaded = await uploadRegistrationPhoto(file)
    setForm((f) => ({ ...f, galleryPhotos: [...f.galleryPhotos, uploaded] }))
  }
  const removeGalleryPhoto = (index) => {
    setForm((f) => ({ ...f, galleryPhotos: f.galleryPhotos.filter((_, i) => i !== index) }))
  }

  // --- Location ---
  const setLocation = (latitude, longitude) => setForm((f) => ({ ...f, latitude, longitude }))

  // --- Step validation (UX guard only — the backend independently
  // re-validates everything on submit, this never replaces that). ---
  const stepErrors = {
    0: !(emailVerifiedNow && phoneVerifiedNow) ? 'Verify both your email and phone to continue.' : '',
    1: !form.groundName.trim() || !form.about.trim() ? 'Ground name and About the Ground are required.' : '',
    2: form.featuredPhotos.some((p) => !p) ? 'All 6 featured photos are required.' : '',
    3: '',
    4: '',
    5: !form.addressLine.trim() || !form.city.trim() || !form.state.trim() ? 'Address, city, and state are required.' : '',
    6: !form.agreedToTerms ? 'You must agree to the Terms & Conditions and Privacy Policy.' : '',
  }

  const canGoNext = !stepErrors[stepIndex]
  const goNext = () => canGoNext && setStepIndex((i) => Math.min(i + 1, WIZARD_STEPS.length - 1))
  const goBack = () => setStepIndex((i) => Math.max(i - 1, 0))
  const goToStep = (i) => setStepIndex(i)

  const submit = async () => {
    if (stepErrors[6]) return
    setSubmitting(true)
    setSubmitError('')
    try {
      const payload = buildSubmissionPayload(form)
      const request = mode === 'edit' ? await resubmitGroundRegistration(publicRequestId, payload) : await submitGroundRegistration(payload)
      setSubmittedRequest(request)
    } catch (err) {
      setSubmitError(err.response?.data?.message || 'Could not submit your ground. Please check the details and try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return {
    steps: WIZARD_STEPS,
    stepIndex,
    goNext,
    goBack,
    goToStep,
    canGoNext,
    stepError: stepErrors[stepIndex],
    loaded,
    form,
    set,
    catalog,
    user,
    emailVerifiedNow,
    phoneVerifiedNow,
    emailDraft,
    setEmailDraft,
    phoneDraft,
    setPhoneDraft,
    emailCodeSent,
    phoneCodeSent,
    contactBusy,
    contactError,
    sendCode,
    verifyCode,
    featuredError,
    uploadFeaturedSlot,
    removeFeaturedSlot,
    addGalleryPhoto,
    removeGalleryPhoto,
    setLocation,
    submitting,
    submitError,
    submittedRequest,
    submit,
    navigate,
  }
}
