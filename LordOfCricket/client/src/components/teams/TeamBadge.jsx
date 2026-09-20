import { useState } from 'react'

// Shared team-logo fallback — reused by TeamCard, TeamHero, and
// MatchCard's team rows so a broken/missing logo never shows a broken image
// icon anywhere in the app: falls back to the team's stored short name.
const SIZE_CLASSES = {
  sm: 'h-9 w-9 text-xs',
  md: 'h-12 w-12 text-sm',
  lg: 'h-20 w-20 text-xl',
}

export default function TeamBadge({ team, size = 'md' }) {
  const [imageFailed, setImageFailed] = useState(false)
  const sizeClass = SIZE_CLASSES[size] || SIZE_CLASSES.md

  if (team.logoUrl && !imageFailed) {
    return (
      <img
        src={team.logoUrl}
        alt={team.name}
        onError={() => setImageFailed(true)}
        className={`${sizeClass} shrink-0 rounded-full border border-white/10 object-cover`}
      />
    )
  }

  return (
    <span className={`${sizeClass} inline-flex shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 font-bold text-emerald-300`}>
      {team.shortName}
    </span>
  )
}
