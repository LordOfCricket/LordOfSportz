import { useState } from 'react'
import { Link } from 'react-router-dom'
import { MessageSquareHeart } from 'lucide-react'
import { useMatchFeedback } from '../../hooks/useMatchFeedback.js'

// A small, dismissible prompt on the completed-match page — never forced,
// never blocking. "Maybe Later" just hides it for this page visit; nothing
// about the match itself depends on the user ever clicking through
// (U6: feedback is an optional post-match action, submit-or-skip).
export default function PostMatchFeedbackPrompt({ matchId }) {
  const { context, loading } = useMatchFeedback(matchId)
  const [dismissed, setDismissed] = useState(false)

  if (loading || dismissed || !context) return null
  if (!context.eligible || context.alreadySubmitted) return null

  return (
    <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/5 p-5">
      <div className="flex items-center gap-3">
        <MessageSquareHeart className="h-6 w-6 shrink-0 text-emerald-300" />
        <p className="text-sm font-semibold text-white">How was your experience?</p>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="rounded-full border border-white/15 px-4 py-2 text-xs font-semibold text-slate-300 transition-colors hover:bg-white/10"
        >
          Maybe Later
        </button>
        <Link
          to={`/matches/${matchId}/feedback`}
          className="rounded-full bg-emerald-500 px-4 py-2 text-xs font-semibold text-emerald-950 transition-colors hover:bg-emerald-400"
        >
          Give Feedback
        </Link>
      </div>
    </div>
  )
}
