import { useEffect, useState } from 'react'
import { TrendingUp, TrendingDown } from 'lucide-react'
import { fetchMyOfficiatingTrend, fetchMyUmpireInsight } from '../../services/umpireSelfApi.js'
import { useAuth } from '../../hooks/useAuth.js'
import AIInsightSection from '../ai/AIInsightSection.jsx'

// Umpire Intelligence & Scale 2.0, Workstream W — "Your Rating 4.8 ↑0.2
// this month" style personal insights, derived entirely from the real
// monthly trend (never an invented "strongest area"/personality trait, per
// the task's own instruction). Loads independently of the rest of the
// dashboard, same posture as AIInsightSection.
function RatingDelta({ thisMonth, lastMonth }) {
  if (thisMonth == null) return null
  if (lastMonth == null) return <span className="text-sm text-slate-400">{thisMonth.toFixed(1)}</span>
  const delta = Math.round((thisMonth - lastMonth) * 100) / 100
  if (delta === 0) return <span className="text-sm text-slate-400">{thisMonth.toFixed(1)} (steady)</span>
  const Icon = delta > 0 ? TrendingUp : TrendingDown
  const colorClass = delta > 0 ? 'text-emerald-300' : 'text-rose-300'
  return (
    <span className={`inline-flex items-center gap-1 text-sm font-semibold ${colorClass}`}>
      {thisMonth.toFixed(1)}
      <Icon className="h-3.5 w-3.5" />
      {Math.abs(delta).toFixed(1)} this month
    </span>
  )
}

export default function PersonalInsights() {
  const { user } = useAuth()
  const [months, setMonths] = useState(null)

  useEffect(() => {
    let cancelled = false
    const timer = window.setTimeout(() => {
      fetchMyOfficiatingTrend(2)
        .then((data) => {
          if (!cancelled) setMonths(data)
        })
        .catch(() => {})
    }, 0)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [])

  const thisMonth = months?.[months.length - 1]
  const lastMonth = months?.[months.length - 2]
  const hasAnyData = thisMonth && (thisMonth.matchesOfficiated > 0 || thisMonth.ratingAvg != null || thisMonth.reliability != null)

  return (
    <div className="mt-8 space-y-4">
      {hasAnyData && (
        <div className="rounded-[1.5rem] border border-white/10 bg-slate-900/50 p-5 shadow-sm backdrop-blur-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">This Month</h2>
          <div className="mt-3 grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="text-xs text-slate-400">Rating</p>
              <RatingDelta thisMonth={thisMonth.ratingAvg} lastMonth={lastMonth?.ratingAvg} />
            </div>
            <div>
              <p className="text-xs text-slate-400">Reliability</p>
              <p className="text-sm font-semibold text-white">{thisMonth.reliability != null ? `${thisMonth.reliability}%` : 'N/A'}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Matches</p>
              <p className="text-sm font-semibold text-white">{thisMonth.matchesOfficiated}</p>
            </div>
          </div>
        </div>
      )}
      <AIInsightSection title="AI Performance Summary" kind="person" fetchFn={fetchMyUmpireInsight} id={user?.id} />
    </div>
  )
}
