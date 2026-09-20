import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Button from '../../components/ui/Button.jsx'
import { STATUS_COPY } from '../../models/umpireStatus.model.js'
import { useUmpireStatus } from '../../hooks/useUmpireStatus.js'
import { useAuth } from '../../hooks/useAuth.js'
import { listMatches } from '../../services/matchApi.js'
import { matchActionForStatus } from '../../models/matchOperations.model.js'
import BackButton from '../../components/common/BackButton.jsx'

export default function UmpireStatusPage() {
  const { user } = useAuth()
  const { request, loading, error, requesting, requestAgain } = useUmpireStatus()
  const [matches, setMatches] = useState([])

  const isStaff = user?.role === 'staff'
  // Only super_admin staff carry match-operations access server-side —
  // admin/canteen_staff are staff but must not see match-operations links
  // they'd just get a 403 from. Match CREATION (POST /matches) is now
  // super_admin-only as of U5.1; an approved umpire can still open the
  // scorer/finalize a match they're assigned to (requireMatchScorer, U3/
  // U3.1), which is what `canOperate` below still needs to allow.
  const isSuperAdminStaff = isStaff && user?.staff_role === 'super_admin'
  const status = request?.status
  const copy = status ? STATUS_COPY[status] : null
  const canOperate = isSuperAdminStaff || status === 'approved'

  useEffect(() => {
    if (!canOperate) return
    // Every match stays visible (never filtered out by status) so Finalize
    // remains reachable for a completed-but-not-yet-finalized match instead
    // of becoming a dead end once staff/umpire navigate away.
    listMatches()
      .then(setMatches)
      .catch(() => setMatches([]))
  }, [canOperate])

  return (
    <main
      className="min-h-screen bg-cover bg-center bg-no-repeat text-white"
      style={{
        backgroundImage: `
          linear-gradient(
            rgba(2,6,23,0.72),
            rgba(2,6,23,0.72)
          ),
          url('/images/cricket-stadium.jpg')
        `,
      }}
    >
      <section className="mx-auto flex min-h-screen max-w-7xl items-center px-8 lg:px-16">
        <div className="w-full max-w-2xl">
          <BackButton fallback="/" className="mb-4" />
          <h1 className="text-5xl font-extrabold text-white">{isSuperAdminStaff ? 'Match Operations' : 'Umpire Access'}</h1>

          <div className="mt-10 rounded-[36px] border border-white/15 bg-slate-900/35 p-10 shadow-2xl backdrop-blur-2xl">
            {loading ? (
              <p className="text-slate-300">Checking your request status…</p>
            ) : canOperate ? (
              <div>
                {!isStaff && copy && (
                  <>
                    <h2 className="text-2xl font-bold text-emerald-300">{copy.title}</h2>
                    <p className="mt-3 text-slate-300">{copy.detail}</p>
                  </>
                )}
                {isSuperAdminStaff && (
                  <p className="text-slate-300">Create matches, open the scorer for a live match, and finalize completed matches.</p>
                )}
                {!isStaff && (
                  <p className="text-slate-300">
                    Open the scorer for a match you're assigned to, and finalize it once complete. Match creation now happens through a ground
                    owner's own dashboard.
                  </p>
                )}

                <div className="mt-8 flex flex-wrap gap-3">
                  {/* U5.1 — match creation is now super_admin-only (was: any
                      approved umpire too). Only super_admin sees this link;
                      it would otherwise lead an umpire to a form that now 403s. */}
                  {isSuperAdminStaff && (
                    <Link
                      to="/matches/new"
                      className="inline-flex items-center justify-center rounded-2xl bg-linear-to-r from-emerald-400 to-emerald-600 px-6 py-3 text-sm font-bold text-emerald-950 shadow-md shadow-emerald-500/30 transition-all hover:-translate-y-0.5"
                    >
                      Create New Match
                    </Link>
                  )}
                  {!isStaff && (
                    <Link
                      to="/umpire/find-matches"
                      className="inline-flex items-center justify-center rounded-2xl bg-linear-to-r from-emerald-400 to-emerald-600 px-6 py-3 text-sm font-bold text-emerald-950 shadow-md shadow-emerald-500/30 transition-all hover:-translate-y-0.5"
                    >
                      Find Umpiring Opportunities
                    </Link>
                  )}
                  {!isStaff && (
                    <Link
                      to="/umpire/dashboard"
                      className="inline-flex items-center justify-center rounded-2xl border border-white/15 px-6 py-3 text-sm font-bold text-white transition-all hover:bg-white/10"
                    >
                      Go to Umpire Dashboard
                    </Link>
                  )}
                </div>

                <div className="mt-8">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Matches</p>
                  {matches.length === 0 ? (
                    <p className="mt-3 text-sm text-slate-400">No matches yet.</p>
                  ) : (
                    <div className="mt-3 space-y-2">
                      {matches.map((m) => {
                        const action = matchActionForStatus(m)
                        return (
                          <Link
                            key={m.id}
                            to={action.to}
                            className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm transition-colors hover:bg-white/10"
                          >
                            <span className="min-w-0 truncate font-semibold text-white">
                              {m.team_a_name} vs {m.team_b_name}
                            </span>
                            <span className="flex shrink-0 items-center gap-2">
                              <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase text-emerald-200">{m.status}</span>
                              <span className="text-xs font-bold text-emerald-300">{action.label}</span>
                            </span>
                          </Link>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            ) : status === 'pending' ? (
              <div>
                <h2 className="text-2xl font-bold text-amber-300">{copy.title}</h2>
                <p className="mt-3 text-slate-300">{copy.detail}</p>
              </div>
            ) : (
              <div>
                {status === 'rejected' && (
                  <>
                    <h2 className="text-2xl font-bold text-rose-300">{copy.title}</h2>
                    <p className="mt-3 text-slate-300">{copy.detail}</p>
                  </>
                )}
                {!status && <p className="text-slate-300">You haven't requested umpire access yet.</p>}

                {error && (
                  <div className="mt-6 rounded-2xl border border-red-400/20 bg-red-500/10 px-5 py-4 text-rose-300">
                    {error}
                  </div>
                )}

                <Button className="mt-6" disabled={requesting} onClick={requestAgain}>
                  {requesting ? 'Sending…' : 'Request Umpire Access'}
                </Button>
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  )
}
