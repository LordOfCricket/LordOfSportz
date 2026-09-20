import { UserPlus, Check } from 'lucide-react'
import { useFollow } from '../../hooks/useFollow.js'

// Follow / Following toggle for a player or team. Renders nothing for a
// logged-out visitor (following is an authenticated-only action; the public
// profile itself stays fully visible). State comes from the server.
export default function FollowButton({ type, id, size = 'md' }) {
  const { available, following, loading, pending, toggle } = useFollow(type, id)

  if (!available) return null

  const pad = size === 'sm' ? 'px-3 py-1 text-xs' : 'px-4 py-1.5 text-sm'

  if (loading || following === null) {
    return <div className={`inline-block h-8 w-24 animate-pulse rounded-full bg-white/10 ${size === 'sm' ? 'h-6 w-20' : ''}`} />
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      aria-pressed={following}
      className={`inline-flex items-center gap-1.5 rounded-full font-semibold transition-colors disabled:opacity-60 ${pad} ${
        following
          ? 'border border-emerald-400/40 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25'
          : 'border border-white/15 bg-white/5 text-slate-100 hover:bg-white/10'
      }`}
    >
      {following ? <Check className="h-3.5 w-3.5" /> : <UserPlus className="h-3.5 w-3.5" />}
      {following ? 'Following' : 'Follow'}
    </button>
  )
}
