import { useNavigate } from 'react-router-dom'
import Avatar from '../ui/Avatar.jsx'
import Button from '../ui/Button.jsx'
import { roleLabel, battingStyleLabel, bowlingStyleLabel, profileCompletion } from '../../models/player.model.js'

function Field({ label, value }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 text-sm font-semibold text-white">{value ?? '—'}</p>
    </div>
  )
}

export default function PlayerSummaryCard({ user, player, team }) {
  const navigate = useNavigate()
  const completion = profileCompletion(player)

  return (
    <div className="rounded-[1.5rem] border border-white/10 bg-slate-900/50 p-6 shadow-sm backdrop-blur-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <Avatar name={user?.name} photoUrl={player?.photo_url} size="lg" />
          <div>
            <h2 className="text-xl font-bold text-white">{user?.name}</h2>
            <p className="text-sm font-semibold text-emerald-300">{player?.public_player_id || 'No public ID yet'}</p>
            <p className="text-sm text-slate-300">{roleLabel(player?.role) || 'Playing role not set'}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button className="h-10 px-4 text-sm" onClick={() => navigate('/profile')}>
            View Profile
          </Button>
          <Button className="h-10 px-4 text-sm from-slate-700 via-slate-600 to-slate-500" onClick={() => navigate('/profile/edit')}>
            Edit Profile
          </Button>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Field label="Batting Style" value={battingStyleLabel(player?.batting_style)} />
        <Field label="Bowling Style" value={bowlingStyleLabel(player?.bowling_style)} />
        <Field label="Jersey Number" value={player?.jersey_number != null ? `#${player.jersey_number}` : null} />
        <Field label="Team" value={team?.name} />
      </div>

      <div className="mt-6">
        <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-slate-400">
          <span>Profile {completion}% Complete</span>
        </div>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full bg-linear-to-r from-emerald-400 to-emerald-600" style={{ width: `${completion}%` }} />
        </div>
      </div>
    </div>
  )
}
