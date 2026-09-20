import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { hasMeaningfulHistory } from '../../models/backNavigation.model.js'

// One reusable back-navigation affordance for the whole app — matches the
// informal convention already used by every hand-rolled "back" link this
// replaces (ArrowLeft + label, emerald-100/70 -> white on hover). Prefers
// real browser-history navigate(-1) when this SPA session has actually
// navigated somewhere (so Back correctly retraces real steps), and falls
// back to a deterministic destination when opened directly via URL/bookmark
// — never navigates the user backward out of the app entirely.
export default function BackButton({ label = 'Back', fallback = '/', className = '' }) {
  const navigate = useNavigate()

  const handleClick = () => {
    if (hasMeaningfulHistory(window.history.state)) navigate(-1)
    else navigate(fallback)
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`-ml-2 inline-flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-medium text-emerald-100/70 transition-colors hover:bg-white/5 hover:text-white ${className}`}
    >
      <ArrowLeft className="h-4 w-4" />
      {label}
    </button>
  )
}
