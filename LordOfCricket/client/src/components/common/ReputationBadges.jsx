import { ShieldCheck, Star, Award, BadgeCheck } from 'lucide-react'
import { badgeLabel, badgeDescription } from '../../models/umpireReputation.model.js'

const BADGE_ICONS = {
  HIGHLY_RELIABLE: ShieldCheck,
  TOP_RATED: Star,
  EXPERIENCED_OFFICIAL: Award,
}

// Shared, compact reputation display — reused across the umpire's own
// profile, the ground-owner assigned-umpire view, and the replacement
// candidate picker, so a badge always looks the same everywhere it appears.
// Deliberately plain pills, no color-coded tiers/animations — "professional
// and trustworthy," not flashy gamification.
export default function ReputationBadges({ verified, badges = [], size = 'md', light = false }) {
  if (!verified && badges.length === 0) return null
  const textSize = size === 'sm' ? 'text-[11px]' : 'text-xs'
  const padding = size === 'sm' ? 'px-2 py-0.5' : 'px-2.5 py-1'

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {verified && (
        <span className={`inline-flex items-center gap-1 rounded-full border ${padding} ${textSize} font-semibold ${light ? 'border-loc-border bg-loc-mint text-loc-green' : 'border-emerald-400/30 bg-emerald-500/10 text-emerald-300'}`}>
          <BadgeCheck className="h-3.5 w-3.5" />
          LOC Verified
        </span>
      )}
      {badges.map((key) => {
        const Icon = BADGE_ICONS[key] || Award
        return (
          <span
            key={key}
            title={badgeDescription(key)}
            className={`inline-flex items-center gap-1 rounded-full border ${padding} ${textSize} font-semibold ${light ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-amber-400/25 bg-amber-500/10 text-amber-200'}`}
          >
            <Icon className="h-3.5 w-3.5" />
            {badgeLabel(key)}
          </span>
        )
      })}
    </div>
  )
}
