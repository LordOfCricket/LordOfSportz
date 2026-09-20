import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, ArrowLeft } from 'lucide-react'
import { useTournaments } from '../../hooks/useTournaments.js'
import { useAuth } from '../../hooks/useAuth.js'
import TournamentCard from '../../components/tournaments/TournamentCard.jsx'
import { StatsErrorState } from '../../components/stats/StatsStates.jsx'
import Navbar from '../../components/home/Navbar.jsx'

const TABS = [
  { key: 'LIVE', label: 'Live' },
  { key: 'UPCOMING', label: 'Upcoming' },
  { key: 'COMPLETED', label: 'Completed' },
]

export default function TournamentsPage() {
  const { user } = useAuth()
  const [category, setCategory] = useState('LIVE')
  const { result, loading, error } = useTournaments(category)

  return (
    <div className="loc-page overflow-x-hidden">
      <Navbar theme="light" />

      <main className="relative mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 pt-32 pb-20 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between">
          <Link
            to="/"
            className="-ml-2 inline-flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-medium text-loc-muted transition-colors hover:bg-loc-mint hover:text-loc-navy"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Home
          </Link>
          {user?.role === 'staff' && (
            <Link to="/tournaments/new" className="loc-btn text-sm">
              <Plus className="h-4 w-4" />
              Create Tournament
            </Link>
          )}
        </div>

        <div>
          <span className="loc-eyebrow">Competitions</span>
          <h1 className="loc-heading font-loc-display text-3xl sm:text-4xl">Tournaments</h1>
          <p className="mt-1 text-sm text-loc-muted">Every competition at the ground — live, upcoming, and completed.</p>
        </div>

        <div className="inline-flex rounded-full loc-card p-1">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setCategory(tab.key)}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                category === tab.key ? 'bg-loc-green text-white' : 'text-loc-muted hover:text-loc-navy'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div>
          {loading && <div className="rounded-2xl border border-dashed border-loc-border bg-loc-mint px-6 py-16 text-center text-sm text-loc-muted">Loading tournaments…</div>}
          {!loading && error && <StatsErrorState light message={error} onRetry={() => window.location.reload()} />}
          {!loading && !error && result && result.items.length === 0 && (
            <div className="rounded-2xl border border-dashed border-loc-border bg-loc-mint px-6 py-16 text-center text-sm text-loc-muted">No tournaments here yet.</div>
          )}
          {!loading && !error && result && result.items.length > 0 && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {result.items.map((t) => (
                <TournamentCard key={t.publicTournamentId} tournament={t} />
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
