import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { UserPlus, UserX } from 'lucide-react'
import GroundOwnerLayout from '../../components/ground-owner/GroundOwnerLayout.jsx'
import GroundNavTabs from '../../components/ground-owner/GroundNavTabs.jsx'
import { StatsErrorState } from '../../components/stats/StatsStates.jsx'
import { useGroundStaff } from '../../hooks/useGroundStaff.js'
import StepUpModal from '../../components/security/StepUpModal.jsx'

const ROLE_LABEL = { GROUND_ADMIN: 'Ground Admin', CANTEEN_STAFF: 'Canteen Staff' }
const PERMISSION_LABEL = {
  MATCH_VIEW: 'View Matches',
  MATCH_MANAGE: 'Manage Matches',
  UMPIRE_MANAGE: 'Manage Umpires',
  STAFF_VIEW: 'View Staff',
  BOOKING_VIEW: 'View Bookings',
  BOOKING_MANAGE: 'Manage Bookings',
  PRICING_VIEW: 'View Pricing',
  PRICING_MANAGE: 'Manage Pricing',
}

function CreateStaffForm({ onCreate, creating, createError }) {
  const [name, setName] = useState('')
  const [identifier, setIdentifier] = useState('')
  const [role, setRole] = useState('GROUND_ADMIN')

  const handleSubmit = async (e) => {
    e.preventDefault()
    const ok = await onCreate({ name, identifier, role })
    if (ok) {
      setName('')
      setIdentifier('')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/5 p-6">
      <h3 className="text-lg font-semibold text-white">Add Staff</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-semibold text-slate-300">Name</span>
          <input
            required
            maxLength={100}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-emerald-400/60 focus:outline-none"
            placeholder="Staff member's name"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-semibold text-slate-300">Email or Phone</span>
          <input
            required
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            className="rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-emerald-400/60 focus:outline-none"
            placeholder="name@example.com or 9999999999"
          />
        </label>
      </div>

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-semibold text-slate-300">Role</span>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value)}
          className="rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2.5 text-sm text-white focus:border-emerald-400/60 focus:outline-none"
        >
          <option value="GROUND_ADMIN">Ground Admin</option>
          <option value="CANTEEN_STAFF">Canteen Staff</option>
        </select>
      </label>

      {createError && <p className="rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-2 text-sm text-red-200">{createError}</p>}

      <button
        type="submit"
        disabled={creating}
        className="inline-flex items-center justify-center gap-2 self-start rounded-full bg-linear-to-r from-green-700 via-green-500 to-lime-500 px-6 py-2.5 text-sm font-semibold text-white shadow-md shadow-green-900/40 transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <UserPlus className="h-4 w-4" />
        {creating ? 'Adding…' : 'Add Staff'}
      </button>
    </form>
  )
}

// Phase 5 — one checkbox per catalog permission. Purely UX: every grant/
// revoke call is independently re-enforced server-side
// (requireGroundRole('GROUND_OWNER') on the route itself), so nothing here
// is a security boundary — checking a box a staff member "shouldn't" have
// only matters because the server would reject it anyway.
function PermissionRow({ member, catalog, onGrant, onRevoke, onDisable }) {
  const granted = new Set(member.permissions)

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/5 px-5 py-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold text-white">{member.name}</p>
          <p className="truncate text-sm text-slate-400">{[member.email, member.phone].filter(Boolean).join(' · ')}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-bold uppercase text-emerald-300">
            {ROLE_LABEL[member.role] || member.role}
          </span>
          <button
            type="button"
            onClick={() => {
              if (window.confirm(`Disable ${member.name}? They will immediately lose all access to this ground.`)) onDisable(member.membershipId)
            }}
            title="Disable this staff member"
            className="inline-flex items-center gap-1 rounded-full border border-red-400/30 px-3 py-1 text-xs font-semibold text-red-300 transition-colors hover:bg-red-500/10"
          >
            <UserX className="h-3.5 w-3.5" />
            Disable
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-x-5 gap-y-2">
        {catalog.map((permission) => {
          const checked = granted.has(permission.key)
          return (
            <label key={permission.key} className="flex items-center gap-2 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={checked}
                onChange={() => (checked ? onRevoke(member.membershipId, permission.key) : onGrant(member.membershipId, permission.key))}
                className="h-4 w-4 rounded border-white/20 bg-slate-950/40 accent-emerald-500"
              />
              {PERMISSION_LABEL[permission.key] || permission.key}
            </label>
          )
        })}
      </div>
    </div>
  )
}

// Phase 4 — Ground Owner creates ground-scoped Staff (GROUND_ADMIN/
// CANTEEN_STAFF). A newly added staff member's first OTP login (existing
// /auth/send-otp + /auth/verify-otp) finds their pre-created account
// automatically, so there's no invite-token step here.
// Phase 5 — grant/revoke granular permissions + disable, per staff member.
export default function GroundStaffPage() {
  const { publicGroundId } = useParams()
  const {
    staff,
    catalog,
    loading,
    error,
    creating,
    createError,
    actionError,
    create,
    grant,
    revoke,
    disable,
    refresh,
    stepUpModal,
    submitStepUp,
    cancelStepUp,
  } = useGroundStaff(publicGroundId)

  return (
    <GroundOwnerLayout title="Staff" subtitle="Add Ground Admins and Canteen Staff, and control what each of them can do.">
      <div className="lg:flex lg:items-start lg:gap-6">
        <GroundNavTabs backLabel="Back" backFallback={`/ground-owner/grounds/${publicGroundId}`} />

        <div className="min-w-0 flex-1">
      <div className="flex flex-col gap-6">
        <CreateStaffForm onCreate={create} creating={creating} createError={createError} />

        <div>
          <h2 className="mb-3 text-xl font-semibold text-white">Current Staff</h2>
          {loading && <p className="text-slate-300">Loading staff…</p>}
          {!loading && error && <StatsErrorState message={error} onRetry={refresh} />}
          {!loading && !error && staff.length === 0 && (
            <div className="rounded-2xl border border-dashed border-white/10 bg-white/5 px-6 py-10 text-center text-slate-300">
              No staff added yet.
            </div>
          )}
          {!loading && !error && staff.length > 0 && (
            <div className="flex flex-col gap-3">
              {actionError && <p className="rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-2 text-sm text-red-200">{actionError}</p>}
              {staff.map((member) => (
                <PermissionRow key={member.membershipId} member={member} catalog={catalog} onGrant={grant} onRevoke={revoke} onDisable={disable} />
              ))}
            </div>
          )}
        </div>
      </div>

      <StepUpModal pending={stepUpModal} onSubmit={submitStepUp} onCancel={cancelStepUp} />
        </div>
      </div>
    </GroundOwnerLayout>
  )
}
