import { Award, CalendarCheck, Target, TrendingUp, Hand } from 'lucide-react'

// Career milestones — comes straight from GET /players/:id/stats (or
// /me/stats): `achievements.earned` + `achievements.next`, both computed
// server-side from finalized-match history (see
// server/src/domain/statistics/careerMilestones.js). No client-side cricket
// math, no fabricated locked badges — only what the player has genuinely
// reached, plus one honest "what's next".

const CATEGORY_ICON = {
  appearance: CalendarCheck,
  batting: TrendingUp,
  bowling: Target,
  fielding: Hand,
}

function formatDate(dateStr) {
  if (!dateStr) return null
  const d = new Date(dateStr)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

function Badge({ achievement, light }) {
  const Icon = CATEGORY_ICON[achievement.category] || Award
  const when = formatDate(achievement.achievedOn?.date)
  return (
    <div className={`flex gap-3 rounded-2xl border p-4 ${light ? 'border-loc-border bg-loc-mint' : 'border-white/10 bg-white/5'}`}>
      <span
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
          light ? 'bg-loc-mint text-loc-green' : 'bg-emerald-500/15 text-emerald-300'
        }`}
      >
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <p className={`truncate text-sm font-bold ${light ? 'text-loc-navy' : 'text-white'}`}>{achievement.title}</p>
        <p className={`text-xs ${light ? 'text-loc-faint' : 'text-slate-400'}`}>{achievement.description}</p>
        {when && (
          <p className={`mt-1 text-[11px] font-semibold uppercase tracking-wide ${light ? 'text-loc-green' : 'text-emerald-300/80'}`}>
            {when}
            {achievement.achievedOn?.opponent ? ` · vs ${achievement.achievedOn.opponent}` : ''}
          </p>
        )}
      </div>
    </div>
  )
}

export default function PlayerAchievements({ achievements, light = false }) {
  const earned = achievements?.earned ?? []
  const next = achievements?.next ?? null

  if (earned.length === 0 && !next) {
    return (
      <div
        className={`flex flex-col items-center gap-3 rounded-2xl border border-dashed px-6 py-10 text-center ${
          light ? 'border-loc-border bg-loc-mint' : 'border-white/10 bg-white/5'
        }`}
      >
        <Award className={`h-8 w-8 ${light ? 'text-loc-faint' : 'text-slate-500'}`} />
        <p className={`text-sm ${light ? 'text-loc-muted' : 'text-slate-300'}`}>
          No career milestones reached yet — they appear as finalized matches add up.
        </p>
      </div>
    )
  }

  const nextPct = next ? Math.min(100, Math.round((next.value / next.target) * 100)) : 0

  return (
    <div className="space-y-4">
      {earned.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {earned.map((a) => (
            <Badge key={a.id} achievement={a} light={light} />
          ))}
        </div>
      )}

      {next && (
        <div className={`rounded-2xl border p-4 ${light ? 'border-loc-border bg-loc-mint' : 'border-white/10 bg-white/5'}`}>
          <p className={`text-[11px] font-semibold uppercase tracking-wide ${light ? 'text-loc-faint' : 'text-slate-400'}`}>Next Milestone</p>
          <p className={`mt-1 text-sm font-bold ${light ? 'text-loc-navy' : 'text-white'}`}>{next.title}</p>
          <div className={`mt-2 h-2 w-full overflow-hidden rounded-full ${light ? 'bg-loc-border-soft' : 'bg-white/10'}`}>
            <div className={`h-full rounded-full ${light ? 'bg-loc-green' : 'bg-emerald-400'}`} style={{ width: `${nextPct}%` }} />
          </div>
          <p className={`mt-1 text-xs ${light ? 'text-loc-faint' : 'text-slate-400'}`}>
            {next.value} / {next.target}
          </p>
        </div>
      )}
    </div>
  )
}
