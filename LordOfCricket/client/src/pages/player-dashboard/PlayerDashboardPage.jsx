import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { usePlayerDashboard } from '../../hooks/usePlayerDashboard.js'
import DashboardHeader from '../../components/dashboard/DashboardHeader.jsx'
import PlayerSummaryCard from '../../components/dashboard/PlayerSummaryCard.jsx'
import NextMatchCard from '../../components/dashboard/NextMatchCard.jsx'
import CareerOverview from '../../components/dashboard/CareerOverview.jsx'
import MyTeams from '../../components/dashboard/MyTeams.jsx'
import RecentMatches from '../../components/dashboard/RecentMatches.jsx'
import QuickActions from '../../components/dashboard/QuickActions.jsx'
import OnboardingBanner from '../../components/dashboard/OnboardingBanner.jsx'
import BackButton from '../../components/common/BackButton.jsx'
import Navbar from '../../components/home/Navbar.jsx'

export default function PlayerDashboardPage() {
  const { user, player, team, isNewPlayer, loading } = usePlayerDashboard()
  const location = useLocation()

  useEffect(() => {
    if (!location.hash) return
    const target = document.getElementById(location.hash.slice(1))
    target?.scrollIntoView({ behavior: 'smooth' })
  }, [location.hash])

  return (
    <main
      className="min-h-screen bg-cover bg-center bg-no-repeat px-4 pt-32 pb-10 text-white sm:px-6 lg:px-8"
      style={{
        backgroundImage: `
          linear-gradient(
            rgba(2,6,23,0.78),
            rgba(2,6,23,0.78)
          ),
          url('/images/cricket-stadium.jpg')
        `,
      }}
    >
      <Navbar />
      <div className="mx-auto max-w-6xl">
        <BackButton fallback="/" className="mb-4" />
        <DashboardHeader name={user?.name} />

        {loading ? (
          <p className="mt-8 text-sm text-slate-400">Loading…</p>
        ) : (
        <div className="mt-8 space-y-6">
          {isNewPlayer && <OnboardingBanner player={player} team={team} />}

          <PlayerSummaryCard user={user} player={player} team={team} />

          <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
            <div className="space-y-6">
              <div id="matches">
                <NextMatchCard teamId={team?.id} />
              </div>
              <div id="career">
                <CareerOverview />
              </div>
              <RecentMatches />
            </div>

            <div className="space-y-6">
              <QuickActions player={player} team={team} />
              <div id="teams">
                <MyTeams team={team} player={player} />
              </div>
            </div>
          </div>
        </div>
        )}
      </div>
    </main>
  )
}
