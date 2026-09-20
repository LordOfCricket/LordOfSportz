import { useHomeDiscovery } from '../../hooks/useHomeDiscovery.js'
import ScrollReveal from '../common/ScrollReveal.jsx'
import { fadeUpSoft } from '../../lib/revealVariants.js'

function FixtureCard({ match }) {
  const timeStr = match.scheduledStartTime || 'TBD'

  return (
    <ScrollReveal variant={fadeUpSoft} amount={0.3} className="loc-card loc-card-hover p-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 lg:gap-6">
        {/* Teams */}
        <div className="flex flex-col items-center justify-center gap-2 lg:col-span-1">
          <p className="text-sm font-semibold text-loc-navy">{match.homeTeam?.name || 'Team A'}</p>
          <p className="text-xs text-loc-muted">vs</p>
          <p className="text-sm font-semibold text-loc-navy">{match.awayTeam?.name || 'Team B'}</p>
        </div>

        {/* Match Details */}
        <div className="flex flex-col justify-center gap-2 text-center lg:col-span-1">
          <p className="text-xs uppercase tracking-widest text-loc-green">{match.format || 'T20'}</p>
          <p className="text-sm text-loc-muted">{timeStr}</p>
        </div>

        {/* Venue */}
        <div className="flex flex-col justify-center gap-2 text-right lg:col-span-1">
          <p className="text-xs uppercase tracking-widest text-loc-green">Venue</p>
          <p className="text-sm text-loc-muted">{match.ground?.name || 'TBD'}</p>
        </div>
      </div>
    </ScrollReveal>
  )
}

export default function UpcomingFixtures() {
  const { matches, loading, error } = useHomeDiscovery()

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)

  const todayEnd = new Date(today)
  todayEnd.setHours(23, 59, 59, 999)

  const tomorrowEnd = new Date(tomorrow)
  tomorrowEnd.setHours(23, 59, 59, 999)

  const todayFixtures = !matches
    ? []
    : matches.filter((m) => {
        const matchDate = new Date(m.createdAt || new Date())
        return matchDate >= today && matchDate <= todayEnd && m.status === 'scheduled'
      })

  const tomorrowFixtures = !matches
    ? []
    : matches.filter((m) => {
        const matchDate = new Date(m.createdAt || new Date())
        return matchDate >= tomorrow && matchDate <= tomorrowEnd && m.status === 'scheduled'
      })

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-loc-border border-t-loc-green" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-dashed border-red-200 bg-red-50 p-6 text-center">
        <p className="text-sm text-red-600">Unable to load fixtures</p>
      </div>
    )
  }

  const hasFixtures = todayFixtures.length > 0 || tomorrowFixtures.length > 0

  if (!hasFixtures) {
    return (
      <div className="rounded-2xl border border-dashed border-loc-border bg-loc-mint p-12 text-center">
        <p className="text-loc-muted">No upcoming fixtures scheduled for today or tomorrow</p>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Today's Fixtures */}
      {todayFixtures.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-loc-green uppercase tracking-widest">Today</h3>
          <div className="space-y-3">
            {todayFixtures.map((match) => (
              <FixtureCard key={match.id} match={match} />
            ))}
          </div>
        </div>
      )}

      {/* Tomorrow's Fixtures */}
      {tomorrowFixtures.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-loc-green uppercase tracking-widest">Tomorrow</h3>
          <div className="space-y-3">
            {tomorrowFixtures.map((match) => (
              <FixtureCard key={match.id} match={match} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
