import { useNavigate } from 'react-router-dom'
import { CheckCircle2, Circle } from 'lucide-react'

export default function OnboardingBanner({ player, team }) {
  const navigate = useNavigate()

  const steps = [
    { label: 'Complete your cricket profile', done: Boolean(player?.role), onClick: () => navigate('/profile/edit') },
    { label: 'Join or create a team', done: Boolean(team), onClick: () => document.getElementById('teams')?.scrollIntoView({ behavior: 'smooth' }) },
    { label: 'Respond to match invitations', done: false, onClick: () => document.getElementById('matches')?.scrollIntoView({ behavior: 'smooth' }) },
    { label: 'Play your first official match', done: false, onClick: null },
    { label: 'Start building your cricket record', done: false, onClick: () => document.getElementById('career')?.scrollIntoView({ behavior: 'smooth' }) },
  ]

  return (
    <div className="rounded-[1.5rem] border border-emerald-400/20 bg-emerald-500/10 p-6 shadow-sm backdrop-blur-sm">
      <h2 className="text-xl font-bold text-white">Welcome to Lord Of Cricket.</h2>
      <p className="mt-1 text-sm text-emerald-100/80">A few steps to build your cricket identity.</p>

      <ul className="mt-5 space-y-3">
        {steps.map((step) => (
          <li key={step.label}>
            <button
              type="button"
              disabled={!step.onClick}
              onClick={step.onClick || undefined}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-colors ${
                step.onClick ? 'hover:bg-white/5' : 'cursor-default'
              } ${step.done ? 'text-emerald-200' : 'text-slate-200'}`}
            >
              {step.done ? <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" /> : <Circle className="h-5 w-5 shrink-0 text-slate-500" />}
              {step.label}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
