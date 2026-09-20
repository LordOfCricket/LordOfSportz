import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarClock, Flag, ClipboardList, MessageCircle } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth.js'
import { useUmpireDashboard } from '../../hooks/useUmpireDashboard.js'
import UmpireLayout from '../../components/umpire-dashboard/UmpireLayout.jsx'
import AssignmentCard from '../../components/umpire-dashboard/AssignmentCard.jsx'
import { StatsLoadingGrid, StatsErrorState } from '../../components/stats/StatsStates.jsx'
import StatTile from '../../components/stats/StatTile.jsx'
import ReputationBadges from '../../components/common/ReputationBadges.jsx'
import MatchChatPanel from '../../components/match/MatchChatPanel.jsx'
import PersonalInsights from '../../components/umpire-dashboard/PersonalInsights.jsx'
import { formatMatchDate, formatMatchTime } from '../../models/matchDiscovery.model.js'

function timeGreeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

function NextAssignmentCard({ assignment }) {
  const [showChat, setShowChat] = useState(false)
  return (
    <div className="rounded-[1.5rem] border border-emerald-400/20 bg-emerald-500/5 p-5 shadow-sm backdrop-blur-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-emerald-400">Next Assignment</p>
      {assignment.ground_name && <p className="mt-2 font-semibold text-white">{assignment.ground_name}</p>}
      <p className="text-slate-200">
        {assignment.team_a_name} vs {assignment.team_b_name}
      </p>
      <p className="mt-1 text-sm text-slate-400">
        {formatMatchDate(assignment.match_date)} · {formatMatchTime(assignment.match_date)}
      </p>
      <div className="mt-4 flex flex-wrap gap-3">
        <Link
          to={`/umpire/matches/${assignment.match_id}/briefing`}
          className="inline-flex h-10 items-center gap-2 rounded-full bg-emerald-500 px-4 text-sm font-semibold text-emerald-950 transition-colors hover:bg-emerald-400"
        >
          <ClipboardList className="h-4 w-4" />
          Match Briefing &amp; Check-In
        </Link>
        <button
          type="button"
          onClick={() => setShowChat((v) => !v)}
          className="inline-flex h-10 items-center gap-2 rounded-full border border-white/15 px-4 text-sm font-semibold text-slate-200 transition-colors hover:bg-white/5"
        >
          <MessageCircle className="h-4 w-4" />
          {showChat ? 'Hide Messages' : 'Message Ground Owner'}
        </button>
      </div>
      {showChat && <MatchChatPanel matchId={assignment.match_id} onClose={() => setShowChat(false)} />}
    </div>
  )
}

export default function UmpireDashboardPage() {
  const { user } = useAuth()
  const {
    loading,
    error,
    upcomingAssignmentsCount,
    upcomingAssignments,
    nextAssignment,
    matchesOfficiated,
    reliability,
    ratingAvg,
    ratingCount,
    verified,
    badges,
    refresh,
  } = useUmpireDashboard()
  const firstName = user?.name?.split(' ')[0] || 'Umpire'

  return (
    <UmpireLayout>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white sm:text-4xl">
            {timeGreeting()}, {firstName}
          </h1>
          <p className="mt-2 text-slate-300">Your Officiating Overview</p>
          {!loading && !error && <ReputationBadges verified={verified} badges={badges} />}
        </div>

        <Link
          to="/umpire/find-matches"
          className="inline-flex h-12 items-center gap-2 rounded-2xl bg-linear-to-r from-emerald-400 to-emerald-600 px-6 text-sm font-bold text-emerald-950 shadow-md shadow-emerald-500/30 transition-all hover:-translate-y-0.5"
        >
          <Flag className="h-4 w-4" />
          Find Umpiring Opportunities
        </Link>
      </div>

      <div className="mt-8">
        {loading && <StatsLoadingGrid tiles={4} />}
        {!loading && error && <StatsErrorState message={error} onRetry={refresh} />}
        {!loading && !error && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile label="Matches Officiated" value={matchesOfficiated} emphasis />
            <StatTile label="Upcoming Assignments" value={upcomingAssignmentsCount} />
            <StatTile label="Reliability" value={reliability != null ? `${reliability}%` : 'N/A'} />
            <StatTile label="Rating" value={ratingCount > 0 ? `${Number(ratingAvg).toFixed(1)} / 5` : 'Not rated yet'} />
          </div>
        )}
      </div>

      {!loading && !error && nextAssignment && (
        <div className="mt-6">
          <NextAssignmentCard assignment={nextAssignment} />
        </div>
      )}

      {!loading && !error && (
        <div className="mt-8">
          <h2 className="text-xl font-semibold text-white">Upcoming Matches</h2>
          {upcomingAssignments.length === 0 ? (
            <div className="mt-4 flex flex-col items-center gap-3 rounded-2xl border border-dashed border-white/10 bg-white/5 px-6 py-10 text-center">
              <CalendarClock className="h-8 w-8 text-slate-500" />
              <p className="text-sm text-slate-300">You don't have any upcoming umpire assignments.</p>
              <Link to="/umpire/find-matches" className="text-sm font-semibold text-emerald-300 hover:text-emerald-200">
                Find grounds that need an umpire →
              </Link>
            </div>
          ) : (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {upcomingAssignments.map((a) => (
                <AssignmentCard key={a.match_id} assignment={a} compact={false} showActions={false} />
              ))}
            </div>
          )}
        </div>
      )}

      {!loading && !error && <PersonalInsights />}
    </UmpireLayout>
  )
}
