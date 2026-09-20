import { useNavigate } from 'react-router-dom'
import { UserPen, Users, BarChart3 } from 'lucide-react'

export default function QuickActions({ player, team }) {
  const navigate = useNavigate()
  const profileIncomplete = !player?.role || !player?.batting_style

  const actions = [
    profileIncomplete && { label: 'Complete Profile', icon: UserPen, onClick: () => navigate('/profile/edit'), highlight: true },
    !team && { label: 'My Teams', icon: Users, onClick: () => document.getElementById('teams')?.scrollIntoView({ behavior: 'smooth' }) },
    { label: 'Statistics', icon: BarChart3, onClick: () => document.getElementById('career')?.scrollIntoView({ behavior: 'smooth' }) },
  ].filter(Boolean)

  return (
    <div className="rounded-[1.5rem] border border-white/10 bg-slate-900/50 p-6 shadow-sm backdrop-blur-sm">
      <h2 className="text-xl font-semibold text-white">Quick Actions</h2>
      <div className="mt-4 grid grid-cols-2 gap-3">
        {actions.map((action) => (
          <button
            key={action.label}
            type="button"
            onClick={action.onClick}
            className={`flex flex-col items-center gap-2 rounded-2xl border px-4 py-4 text-center text-sm font-semibold transition-colors ${
              action.highlight
                ? 'border-emerald-400/40 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25'
                : 'border-white/10 bg-white/5 text-slate-200 hover:bg-white/10'
            }`}
          >
            <action.icon className="h-5 w-5" />
            {action.label}
          </button>
        ))}
      </div>
    </div>
  )
}
