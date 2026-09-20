import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { CheckCircle2 } from 'lucide-react'
import { useMatchFeedback } from '../../hooks/useMatchFeedback.js'
import { buildFeedbackPayload, hasAnyRating, APP_FEATURES } from '../../models/matchFeedback.model.js'
import StarRating from '../../components/feedback/StarRating.jsx'
import Button from '../../components/ui/Button.jsx'
import BackButton from '../../components/common/BackButton.jsx'

function Section({ title, children }) {
  return (
    <section className="rounded-[1.5rem] border border-white/10 bg-slate-900/50 p-6 shadow-sm backdrop-blur-sm">
      <h2 className="text-lg font-bold text-white">{title}</h2>
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  )
}

function Textarea({ label, value, onChange }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-semibold text-slate-200">{label}</span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={2}
        maxLength={500}
        className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm text-white"
      />
    </label>
  )
}

export default function MatchFeedbackPage() {
  const { matchId } = useParams()
  const { context, loading, error, submitting, submitError, submitted, submit } = useMatchFeedback(matchId)

  const [groundRating, setGroundRating] = useState(0)
  const [groundLiked, setGroundLiked] = useState('')
  const [groundImprove, setGroundImprove] = useState('')
  const [appRating, setAppRating] = useState(0)
  const [appFeature, setAppFeature] = useState('')
  const [appLiked, setAppLiked] = useState('')
  const [appImprove, setAppImprove] = useState('')
  const [umpireRatings, setUmpireRatings] = useState({})
  const [formError, setFormError] = useState('')

  const setUmpireField = (umpireUserId, field, value) => {
    setUmpireRatings((prev) => ({ ...prev, [umpireUserId]: { ...prev[umpireUserId], [field]: value } }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setFormError('')
    const payload = buildFeedbackPayload({ groundRating, groundLiked, groundImprove, appRating, appFeature, appLiked, appImprove, umpireRatings })
    if (!hasAnyRating(payload)) {
      setFormError('Rate at least one thing — the ground, an umpire, or LOC itself.')
      return
    }
    await submit(payload)
  }

  return (
    <main
      className="min-h-screen bg-cover bg-center bg-no-repeat px-4 py-10 text-white sm:px-6 lg:px-8"
      style={{ backgroundImage: `linear-gradient(rgba(2,6,23,0.78), rgba(2,6,23,0.78)), url('/images/cricket-stadium.jpg')` }}
    >
      <div className="mx-auto max-w-2xl">
        <BackButton label="Back to Match" fallback={`/matches/${matchId}/setup`} />

        <h1 className="mt-6 text-3xl font-bold text-white">How was your match?</h1>

        {loading && <p className="mt-8 text-slate-300">Loading…</p>}

        {!loading && error && <p className="mt-8 text-rose-300">{error}</p>}

        {!loading && !error && context && !context.available && (
          <p className="mt-8 text-slate-300">Feedback opens once this match is completed.</p>
        )}

        {!loading && !error && context && context.available && !context.eligible && (
          <p className="mt-8 text-slate-300">You're not eligible to submit feedback for this match.</p>
        )}

        {!loading && !error && context && context.available && context.eligible && (context.alreadySubmitted || submitted) && (
          <div className="mt-8 flex flex-col items-center gap-3 rounded-[1.5rem] border border-emerald-400/20 bg-emerald-500/10 p-8 text-center">
            <CheckCircle2 className="h-10 w-10 text-emerald-300" />
            <p className="text-lg font-semibold text-white">Thanks for your feedback!</p>
            <Link to={`/matches/${matchId}/setup`} className="text-sm font-semibold text-emerald-300 hover:text-emerald-200">
              Back to match
            </Link>
          </div>
        )}

        {!loading && !error && context && context.available && context.eligible && !context.alreadySubmitted && !submitted && (
          <form onSubmit={handleSubmit} className="mt-8 space-y-6">
            {context.categories.ground && (
              <Section title={`Ground${context.ground ? ` — ${context.ground.name}` : ''}`}>
                <StarRating value={groundRating} onChange={setGroundRating} />
                <Textarea label="What did you like about this ground?" value={groundLiked} onChange={setGroundLiked} />
                <Textarea label="What could be improved?" value={groundImprove} onChange={setGroundImprove} />
              </Section>
            )}

            {context.categories.umpire &&
              context.ratableUmpires.map((umpire) => (
                <Section key={umpire.userId} title={`Umpiring — ${umpire.name}`}>
                  <StarRating value={umpireRatings[umpire.userId]?.rating || 0} onChange={(v) => setUmpireField(umpire.userId, 'rating', v)} />
                  <Textarea
                    label="What did you like about the umpiring?"
                    value={umpireRatings[umpire.userId]?.liked || ''}
                    onChange={(v) => setUmpireField(umpire.userId, 'liked', v)}
                  />
                  <Textarea
                    label="What could be improved?"
                    value={umpireRatings[umpire.userId]?.improve || ''}
                    onChange={(v) => setUmpireField(umpire.userId, 'improve', v)}
                  />
                </Section>
              ))}

            {context.categories.app && (
              <Section title="LOC">
                <StarRating value={appRating} onChange={setAppRating} label="How was your experience with LOC?" />
                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-slate-200">Which LOC feature did you like most?</span>
                  <select
                    value={appFeature}
                    onChange={(e) => setAppFeature(e.target.value)}
                    className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm text-white"
                  >
                    <option value="" className="bg-slate-900">— Select —</option>
                    {APP_FEATURES.map((f) => (
                      <option key={f.value} value={f.value} className="bg-slate-900">
                        {f.label}
                      </option>
                    ))}
                  </select>
                </label>
                <Textarea label="What did you like?" value={appLiked} onChange={setAppLiked} />
                <Textarea label="What should we improve in LOC?" value={appImprove} onChange={setAppImprove} />
              </Section>
            )}

            {(formError || submitError) && (
              <div className="rounded-2xl border border-red-400/20 bg-red-500/10 px-5 py-4 text-sm text-rose-300">{formError || submitError}</div>
            )}

            <div className="flex flex-wrap gap-3">
              <Button type="submit" disabled={submitting} className="h-12 flex-1">
                {submitting ? 'Submitting…' : 'Submit Feedback'}
              </Button>
              <Link
                to={`/matches/${matchId}/setup`}
                className="inline-flex h-12 items-center justify-center rounded-2xl border border-white/15 px-6 text-sm font-semibold text-slate-200 transition-colors hover:bg-white/10"
              >
                Skip for now
              </Link>
            </div>
          </form>
        )}
      </div>
    </main>
  )
}
