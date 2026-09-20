import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Swords, CalendarClock, UtensilsCrossed, User, LandPlot, ArrowLeft } from 'lucide-react'
import StaffLayout from '../../components/staff/StaffLayout.jsx'
import { StatsErrorState } from '../../components/stats/StatsStates.jsx'
import { useMyGroundStaffMemberships } from '../../hooks/useMyGroundStaffMemberships.js'
import { getStaffCanteenHref } from '../../models/groundStaffNav.model.js'

const ROLE_LABEL = { GROUND_ADMIN: 'Ground Admin', CANTEEN_STAFF: 'Canteen Staff' }

function ModuleCard({ icon: Icon, label, description, to }) {
  return (
    <Link to={to} className="block h-full">
      <div className="flex h-full flex-col gap-3 rounded-2xl border border-white/10 bg-white/5 p-5 transition hover:border-emerald-400/40 hover:bg-white/10">
        <Icon className="h-6 w-6 text-emerald-300" />
        <div>
          <p className="font-semibold text-white">{label}</p>
          <p className="mt-1 text-sm text-slate-400">{description}</p>
        </div>
      </div>
    </Link>
  )
}

function GroundHub({ membership, onSwitchGround, showSwitch }) {
  const perms = membership.permissions || []
  const canMatches = perms.includes('MATCH_VIEW') || perms.includes('MATCH_MANAGE')
  const canBookings = perms.includes('BOOKING_VIEW') || perms.includes('BOOKING_MANAGE')

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold text-white sm:text-4xl">{membership.groundName}</h1>
          <p className="mt-2 text-slate-300">{ROLE_LABEL[membership.role] || membership.role}</p>
        </div>
        {showSwitch && (
          <button
            type="button"
            onClick={onSwitchGround}
            className="flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-white/10"
          >
            <ArrowLeft className="h-4 w-4" />
            Switch Ground
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {canMatches && (
          <ModuleCard
            icon={Swords}
            label="Matches"
            description="View and manage matches, umpire slots, and incidents."
            to={`/staff/grounds/${membership.publicGroundId}`}
          />
        )}
        {canBookings && (
          <ModuleCard
            icon={CalendarClock}
            label="Bookings"
            description="View and manage match/practice bookings."
            to={`/staff/grounds/${membership.publicGroundId}/bookings`}
          />
        )}
        <ModuleCard
          icon={UtensilsCrossed}
          label="Canteen"
          description={membership.role === 'CANTEEN_STAFF' ? 'View and update customer orders.' : 'Manage the menu, today’s menu, and orders.'}
          to={getStaffCanteenHref(membership, membership.publicGroundId)}
        />
        <ModuleCard icon={User} label="My Profile" description="View and edit your account details." to="/profile" />
      </div>
    </div>
  )
}

export default function StaffDashboardPage() {
  const { memberships, loading, error, refetch } = useMyGroundStaffMemberships()
  const [selectedId, setSelectedId] = useState(null)

  if (loading) {
    return (
      <StaffLayout>
        <div className="animate-pulse space-y-6">
          <div className="h-8 w-1/3 rounded bg-slate-700" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="h-32 rounded-2xl bg-slate-700" />
            <div className="h-32 rounded-2xl bg-slate-700" />
            <div className="h-32 rounded-2xl bg-slate-700" />
          </div>
        </div>
      </StaffLayout>
    )
  }

  if (error) {
    return (
      <StaffLayout title="Staff Dashboard">
        <StatsErrorState message={error} onRetry={refetch} />
      </StaffLayout>
    )
  }

  if (memberships.length === 0) {
    return (
      <StaffLayout title="Staff Dashboard">
        <div className="rounded-2xl border border-dashed border-white/15 bg-white/5 px-6 py-16 text-center">
          <p className="text-lg font-semibold text-white">
            You haven&apos;t been assigned to any ground yet. Please contact your Ground Owner.
          </p>
        </div>
      </StaffLayout>
    )
  }

  if (memberships.length === 1) {
    return (
      <StaffLayout>
        <GroundHub membership={memberships[0]} showSwitch={false} />
      </StaffLayout>
    )
  }

  const selected = memberships.find((m) => m.membershipId === selectedId)

  if (!selected) {
    return (
      <StaffLayout title="Staff Dashboard" subtitle="Choose a ground to manage.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {memberships.map((m) => (
            <button
              key={m.membershipId}
              type="button"
              onClick={() => setSelectedId(m.membershipId)}
              className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/5 p-5 text-left transition hover:border-emerald-400/40 hover:bg-white/10"
            >
              <LandPlot className="h-6 w-6 text-emerald-300" />
              <div>
                <p className="font-semibold text-white">{m.groundName}</p>
                <p className="mt-1 text-sm text-slate-400">{ROLE_LABEL[m.role] || m.role}</p>
              </div>
            </button>
          ))}
        </div>
      </StaffLayout>
    )
  }

  return (
    <StaffLayout>
      <GroundHub membership={selected} onSwitchGround={() => setSelectedId(null)} showSwitch />
    </StaffLayout>
  )
}
