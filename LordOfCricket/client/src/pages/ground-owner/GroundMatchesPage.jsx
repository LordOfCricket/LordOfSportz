import { useEffect, useState } from 'react'
import { useParams, useLocation } from 'react-router-dom'
import { CalendarDays, ChevronDown, ChevronUp, Trophy, MessageCircle } from 'lucide-react'
import { useMyGrounds } from '../../hooks/useMyGrounds.js'
import { useGroundMatches } from '../../hooks/useGroundMatches.js'
import { useMatchUmpireSlots } from '../../hooks/useMatchUmpireSlots.js'
import { useUmpireOperationsSummary } from '../../hooks/useUmpireOperationsSummary.js'
import { useMyGroundStaffMemberships } from '../../hooks/useMyGroundStaffMemberships.js'
import { hasStaffPermission } from '../../models/groundStaffNav.model.js'
import { fetchTeams } from '../../services/playerApi.js'
import { formatMatchDate, formatMatchTime, statusLabel, formatMatchResultLine } from '../../models/matchDiscovery.model.js'
import { slotStatusInfo, describeSlot } from '../../models/groundOwnerDashboard.model.js'
import { PAYMENT_STATUSES, paymentStatusLabel, paymentStatusClasses, formatAmount } from '../../models/umpireEarnings.model.js'
import { proposalStatusLabel, proposalStatusClasses } from '../../models/umpireProposal.model.js'
import { staffingForecastLabel, staffingForecastClasses } from '../../models/staffingForecast.model.js'
import GroundOwnerLayout from '../../components/ground-owner/GroundOwnerLayout.jsx'
import GroundNavTabs from '../../components/ground-owner/GroundNavTabs.jsx'
import ReplacementPicker from '../../components/ground-owner/ReplacementPicker.jsx'
import RecommendedUmpires from '../../components/ground-owner/RecommendedUmpires.jsx'
import AssignmentHistory from '../../components/ground-owner/AssignmentHistory.jsx'
import ReputationBadges from '../../components/common/ReputationBadges.jsx'
import MatchChatPanel from '../../components/match/MatchChatPanel.jsx'
import { StatsErrorState } from '../../components/stats/StatsStates.jsx'
import StatTile from '../../components/stats/StatTile.jsx'

function CreateMatchForm({ onCreate, creating, createError, onDone }) {
  const [teams, setTeams] = useState([])
  const [teamAId, setTeamAId] = useState('')
  const [teamBId, setTeamBId] = useState('')
  const [matchDate, setMatchDate] = useState('')
  const [requiredUmpires, setRequiredUmpires] = useState(2)
  const [formError, setFormError] = useState('')

  useEffect(() => {
    fetchTeams().then(setTeams).catch(() => setTeams([]))
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setFormError('')
    if (!teamAId || !teamBId) return setFormError('Select both teams.')
    if (teamAId === teamBId) return setFormError('Team A and Team B must be different.')
    if (!matchDate) return setFormError('Match date is required.')

    const ok = await onCreate({
      teamAId: Number(teamAId),
      teamBId: Number(teamBId),
      matchDate,
      requiredUmpires: Number(requiredUmpires),
    })
    if (ok) onDone()
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4 space-y-4 rounded-[1.5rem] border border-white/10 bg-slate-900/50 p-6 shadow-sm backdrop-blur-sm">
      {(formError || createError) && (
        <div className="rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-rose-300">{formError || createError}</div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-2 block text-sm font-semibold text-slate-200">Team A</span>
          <select
            value={teamAId}
            onChange={(e) => setTeamAId(e.target.value)}
            className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm text-white"
          >
            <option value="" className="bg-slate-900">— Select —</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id} className="bg-slate-900">{t.name}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-2 block text-sm font-semibold text-slate-200">Team B</span>
          <select
            value={teamBId}
            onChange={(e) => setTeamBId(e.target.value)}
            className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm text-white"
          >
            <option value="" className="bg-slate-900">— Select —</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id} className="bg-slate-900">{t.name}</option>
            ))}
          </select>
        </label>
      </div>

      <label className="block">
        <span className="mb-2 block text-sm font-semibold text-slate-200">Date &amp; Time</span>
        <input
          type="datetime-local"
          value={matchDate}
          onChange={(e) => setMatchDate(e.target.value)}
          required
          className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm text-white"
        />
      </label>

      <label className="block">
        <span className="mb-2 block text-sm font-semibold text-slate-200">Required Umpires</span>
        <input
          type="number"
          min={0}
          max={4}
          value={requiredUmpires}
          onChange={(e) => setRequiredUmpires(e.target.value)}
          className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm text-white"
        />
      </label>

      <button
        type="submit"
        disabled={creating}
        className="h-12 w-full rounded-2xl bg-linear-to-r from-green-700 via-green-500 to-lime-500 text-sm font-semibold text-white shadow-lg shadow-green-900/40 transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {creating ? 'Creating…' : 'Create Match'}
      </button>
    </form>
  )
}

function PaymentStatusControl({ matchId, slot, slotsHook, canManage }) {
  const busy = slotsHook.actionBusyId === slot.id
  if (!slot.earning) return null
  return (
    <div className="mt-1.5 flex items-center gap-2">
      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${paymentStatusClasses(slot.earning.status)}`}>
        {formatAmount(slot.earning.amount, slot.earning.currency)} · {paymentStatusLabel(slot.earning.status)}
      </span>
      {canManage && (
        <select
          disabled={busy}
          value=""
          onChange={(e) => {
            if (e.target.value) slotsHook.updatePaymentStatus(matchId, slot.id, e.target.value)
            e.target.value = ''
          }}
          className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[10px] text-slate-300 disabled:opacity-50"
        >
          <option value="" className="bg-slate-900">
            Change status…
          </option>
          {PAYMENT_STATUSES.filter((s) => s !== slot.earning.status).map((s) => (
            <option key={s} value={s} className="bg-slate-900">
              {paymentStatusLabel(s)}
            </option>
          ))}
        </select>
      )}
    </div>
  )
}

function PendingProposalsForSlot({ matchId, slotId, proposals, slotsHook }) {
  const pending = (proposals || []).filter((p) => p.match_umpire_slot_id === slotId && p.status === 'PENDING')
  if (pending.length === 0) return null
  return (
    <ul className="mt-1.5 space-y-1">
      {pending.map((p) => {
        const busy = slotsHook.actionBusyId === `proposal-${p.id}`
        return (
          <li key={p.id} className={`flex items-center justify-between gap-2 rounded-full border px-2.5 py-1 text-[11px] ${proposalStatusClasses(p.status)}`}>
            <span>
              Offered to {p.umpire_name}
              {Number(p.incentive_amount) > 0 ? ` (+${formatAmount(p.incentive_amount, p.currency)})` : ''} · {proposalStatusLabel(p.status)}
            </span>
            <button
              type="button"
              disabled={busy}
              onClick={() => slotsHook.cancelProposal(matchId, p.id)}
              className="shrink-0 font-semibold underline decoration-dotted hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? 'Withdrawing…' : 'Withdraw'}
            </button>
          </li>
        )
      })}
    </ul>
  )
}

function SlotRow({ publicGroundId, matchId, matchStatus, slot, index, slotsHook, proposals, canManage }) {
  const [findingReplacement, setFindingReplacement] = useState(false)
  const [showChat, setShowChat] = useState(false)
  const { label, detail } = describeSlot(slot)
  const busy = slotsHook.actionBusyId === slot.id
  const canMarkNoShow = slot.status === 'ASSIGNED' && (matchStatus === 'upcoming' || matchStatus === 'live')

  return (
    <div className="border-b border-white/5 py-2 last:border-b-0">
      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-400">Umpire {index + 1}</span>
        <span className={detail ? 'font-semibold text-white' : 'text-slate-500'}>
          {label}
          {detail && <span className="ml-1.5 text-emerald-300">· {detail}</span>}
        </span>
      </div>
      {slot.reputation && (
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-400">
          {slot.reputation.ratingCount > 0 && <span>⭐ {Number(slot.reputation.ratingAvg).toFixed(1)}</span>}
          {slot.reputation.reliability != null && <span>Reliability {slot.reputation.reliability}%</span>}
          <span>{slot.reputation.matchesOfficiated} Matches</span>
          <ReputationBadges verified={slot.reputation.verified} badges={slot.reputation.badges} size="sm" />
        </div>
      )}
      <PaymentStatusControl matchId={matchId} slot={slot} slotsHook={slotsHook} canManage={canManage} />
      <PendingProposalsForSlot matchId={matchId} slotId={slot.id} proposals={proposals} slotsHook={slotsHook} />
      {(slot.status === 'ASSIGNED' || slot.status === 'COMPLETED') && slot.umpire_user_id && (
        <button
          type="button"
          onClick={() => setShowChat((v) => !v)}
          className="mt-1.5 flex items-center gap-1 rounded-full border border-white/15 px-2.5 py-1 text-[11px] font-semibold text-slate-300 transition-colors hover:bg-white/5"
        >
          <MessageCircle className="h-3 w-3" />
          {showChat ? 'Hide Messages' : 'Message Umpire'}
        </button>
      )}
      {showChat && <MatchChatPanel matchId={matchId} onClose={() => setShowChat(false)} />}
      {canMarkNoShow && (
        <button
          type="button"
          disabled={busy}
          onClick={() => slotsHook.markNoShow(matchId, slot.id)}
          className="mt-1.5 rounded-full border border-rose-400/30 px-2.5 py-1 text-[11px] font-semibold text-rose-300 transition-colors hover:bg-rose-500/10 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? 'Marking…' : 'Mark No-Show'}
        </button>
      )}
      {slot.status === 'NO_SHOW' && !findingReplacement && (
        <button
          type="button"
          onClick={() => setFindingReplacement(true)}
          className="mt-1.5 rounded-full bg-emerald-500 px-2.5 py-1 text-[11px] font-semibold text-emerald-950 transition-colors hover:bg-emerald-400"
        >
          Find Replacement
        </button>
      )}
      {slot.status === 'NO_SHOW' && findingReplacement && (
        <ReplacementPicker
          publicGroundId={publicGroundId}
          matchId={matchId}
          slotId={slot.id}
          busy={busy}
          onCancel={() => setFindingReplacement(false)}
          onAssign={async (newUmpireUserId) => {
            const ok = await slotsHook.assignReplacement(matchId, slot.id, newUmpireUserId)
            if (ok) setFindingReplacement(false)
          }}
        />
      )}
    </div>
  )
}

function FeeControl({ matchId, matchStatus, umpireFee, slotsHook, canManage }) {
  const [editing, setEditing] = useState(false)
  const [amountDraft, setAmountDraft] = useState('')
  const busy = slotsHook.actionBusyId === `fee-${matchId}`
  const locked = matchStatus === 'completed' || matchStatus === 'finalized' || !canManage

  const startEdit = () => {
    setAmountDraft(umpireFee?.amount ?? '')
    setEditing(true)
  }

  const submit = async (e) => {
    e.preventDefault()
    const amount = Number(amountDraft)
    if (!Number.isFinite(amount) || amount < 0) return
    const ok = await slotsHook.setFee(matchId, { amount, currency: umpireFee?.currency || 'INR' })
    if (ok) setEditing(false)
  }

  return (
    <div className="mb-2 flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs">
      <div>
        <span className="text-slate-400">Umpire Fee (per umpire)</span>{' '}
        <span className="font-semibold text-white">{umpireFee ? formatAmount(umpireFee.amount, umpireFee.currency) : 'Not set'}</span>
      </div>
      {!locked && !editing && (
        <button type="button" onClick={startEdit} className="font-semibold text-emerald-300 hover:text-emerald-200">
          {umpireFee ? 'Edit' : 'Set fee'}
        </button>
      )}
      {!locked && editing && (
        <form onSubmit={submit} className="flex items-center gap-2">
          <input
            type="number"
            min={0}
            step="0.01"
            value={amountDraft}
            onChange={(e) => setAmountDraft(e.target.value)}
            className="w-20 rounded-full border border-white/15 bg-white/5 px-2 py-1 text-white"
            autoFocus
          />
          <button type="submit" disabled={busy} className="font-semibold text-emerald-300 hover:text-emerald-200 disabled:opacity-50">
            {busy ? 'Saving…' : 'Save'}
          </button>
          <button type="button" onClick={() => setEditing(false)} className="text-slate-400 hover:text-slate-200">
            Cancel
          </button>
        </form>
      )}
    </div>
  )
}

function SlotDetail({ publicGroundId, matchId, matchStatus, slots, umpireFee, loading, error, onExpand, slotsHook, hasOpenCapacity, canManage }) {
  const [expanded, setExpanded] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const openSlot = slots?.find((s) => s.status === 'AVAILABLE' || s.status === 'CANCELLED')
  const proposals = slotsHook.proposalsByMatch[matchId]

  const toggle = () => {
    if (!expanded) {
      onExpand(matchId)
      slotsHook.loadProposals(matchId)
    }
    setExpanded((v) => !v)
  }

  return (
    <div className="mt-3">
      <div className="flex items-center gap-4">
        <button type="button" onClick={toggle} className="flex items-center gap-1.5 text-xs font-semibold text-emerald-300 hover:text-emerald-200">
          {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          {expanded ? 'Hide umpire status' : 'View umpire status'}
        </button>
        <button type="button" onClick={() => setShowHistory((v) => !v)} className="text-xs font-semibold text-slate-400 hover:text-slate-200">
          {showHistory ? 'Hide history' : 'History'}
        </button>
      </div>
      {expanded && (
        <div className="mt-2 space-y-1.5">
          {loading && <p className="text-xs text-slate-400">Loading…</p>}
          {!loading && error && <p className="text-xs text-rose-300">{error}</p>}
          {!loading && !error && slots && (
            <div className="rounded-xl border border-white/10 bg-white/5 p-3">
              <FeeControl matchId={matchId} matchStatus={matchStatus} umpireFee={umpireFee} slotsHook={slotsHook} canManage={canManage} />
              {hasOpenCapacity && matchStatus === 'upcoming' && (
                <RecommendedUmpires
                  publicGroundId={publicGroundId}
                  matchId={matchId}
                  openSlotId={openSlot?.id}
                  onPropose={(slotId, umpireUserId, payload) => slotsHook.proposeUmpire(matchId, slotId, umpireUserId, payload)}
                  proposeBusy={openSlot && slotsHook.actionBusyId === openSlot.id}
                  proposeError={slotsHook.actionError}
                />
              )}
              {slots.map((slot, i) => (
                <SlotRow
                  key={slot.id}
                  publicGroundId={publicGroundId}
                  matchId={matchId}
                  matchStatus={matchStatus}
                  slot={slot}
                  index={i}
                  slotsHook={slotsHook}
                  proposals={proposals}
                  canManage={canManage}
                />
              ))}
              {slotsHook.actionError && <p className="mt-2 text-xs text-rose-300">{slotsHook.actionError}</p>}
            </div>
          )}
        </div>
      )}
      {showHistory && (
        <div className="mt-2 rounded-xl border border-white/10 bg-white/5 p-3">
          <AssignmentHistory publicGroundId={publicGroundId} matchId={matchId} />
        </div>
      )}
    </div>
  )
}

function MatchCard({ publicGroundId, match, slotsHook, lifecycleHook, canManage }) {
  const status = slotStatusInfo(match)
  const busy = lifecycleHook.lifecycleBusyId === match.id
  const result = lifecycleHook.lifecycleResults[match.id]
  const isDecided = match.status === 'completed' || match.status === 'finalized'
  const resultLine = isDecided
    ? formatMatchResultLine(
        match.result_type ? { resultType: match.result_type, winnerTeamId: match.winner_team_id, text: match.result } : null,
        { id: match.team_a_id, name: match.team_a_name },
        { id: match.team_b_id, name: match.team_b_name },
      )
    : null

  return (
    <div className="rounded-[1.5rem] border border-white/10 bg-slate-900/50 p-5 shadow-sm backdrop-blur-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-base font-bold text-white">
            {match.team_a_name} vs {match.team_b_name}
          </p>
          <p className="mt-1 flex items-center gap-2 text-sm text-slate-300">
            <CalendarDays className="h-4 w-4 text-emerald-300" />
            {formatMatchDate(match.match_date)} · {formatMatchTime(match.match_date)}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-white/10 px-3 py-1 text-xs font-bold uppercase text-slate-300">
          {statusLabel({ status: match.status })}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        <span className="font-semibold text-white">
          {match.filled_slots} / {match.total_slots}
        </span>
        <span>
          {status.emoji} {status.label}
        </span>
        {match.staffingForecast && match.staffingForecast.status !== 'NOT_REQUIRED' && (
          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${staffingForecastClasses(match.staffingForecast.status)}`}>
            {staffingForecastLabel(match.staffingForecast.status)}
          </span>
        )}
      </div>

      {match.total_slots > 0 && (
        <SlotDetail
          publicGroundId={publicGroundId}
          matchId={match.id}
          matchStatus={match.status}
          slots={slotsHook.slotsByMatch[match.id]}
          umpireFee={slotsHook.umpireFeeByMatch[match.id]}
          loading={slotsHook.loadingId === match.id}
          error={slotsHook.error}
          onExpand={slotsHook.load}
          slotsHook={slotsHook}
          hasOpenCapacity={match.filled_slots < match.total_slots}
          canManage={canManage}
        />
      )}

      {isDecided && resultLine && (
        <p className="mt-4 flex items-center gap-2 rounded-xl border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-sm font-semibold text-amber-200">
          <Trophy className="h-4 w-4 shrink-0 text-amber-300" />
          {resultLine}
        </p>
      )}

      {result?.type === 'understaffed' && (
        <div className="mt-4 rounded-xl border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
          Only {result.filledSlots} of {result.totalSlots} umpire slots are filled.
          {canManage && (
            <button
              type="button"
              disabled={busy}
              onClick={() => lifecycleHook.start(match.id, { confirmUnderstaffed: true })}
              className="ml-2 rounded-full bg-amber-400 px-3 py-1 text-xs font-bold text-amber-950 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Start anyway
            </button>
          )}
        </div>
      )}
      {result?.type === 'error' && <p className="mt-4 rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-2 text-sm text-rose-300">{result.message}</p>}

      {canManage && match.status === 'upcoming' && (
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => lifecycleHook.start(match.id)}
            className="h-11 flex-1 rounded-2xl bg-linear-to-r from-green-700 via-green-500 to-lime-500 text-sm font-semibold text-white shadow-md shadow-green-900/40 transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? 'Starting…' : 'Match is Starting'}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (!window.confirm('Cancel this match? Any assigned or proposed umpires will be notified and released.')) return
              const reason = window.prompt('Reason (optional, shown to affected umpires):') || undefined
              lifecycleHook.cancel(match.id, reason)
            }}
            className="h-11 rounded-2xl border border-rose-400/30 px-4 text-sm font-semibold text-rose-300 transition-colors hover:bg-rose-500/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      )}
      {canManage && match.status === 'live' && (
        <button
          type="button"
          disabled={busy}
          onClick={() => lifecycleHook.complete(match.id)}
          className="mt-4 h-11 w-full rounded-2xl border border-rose-400/30 text-sm font-semibold text-rose-300 transition-colors hover:bg-rose-500/10 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? 'Ending…' : 'Match is Over'}
        </button>
      )}
    </div>
  )
}

// Umpire Intelligence & Scale 2.0, Workstream J — a small, honest summary
// (never a misleading average from too few reviews — see the backend's own
// GROUND_RATING_MIN_SAMPLE guard).
function UmpireOperationsSummaryPanel({ publicGroundId }) {
  const { summary, loading, error } = useUmpireOperationsSummary(publicGroundId)
  if (loading || error || !summary) return null
  return (
    <div className="mt-4 rounded-[1.5rem] border border-white/10 bg-slate-900/50 p-5 shadow-sm backdrop-blur-sm">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Umpire Operations This Month</h2>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <StatTile label="Matches" value={summary.matchesThisMonth} />
        <StatTile label="Fully Staffed" value={summary.fullyStaffed} />
        <StatTile label="Needs Attention" value={summary.currentlyUnderstaffedUpcoming} />
        <StatTile label="Avg Umpire Rating" value={summary.avgUmpireRating != null ? summary.avgUmpireRating.toFixed(1) : 'Not enough data'} />
        <StatTile label="No-Shows" value={summary.noShowCount} />
      </div>
    </div>
  )
}

export default function GroundMatchesPage() {
  const { publicGroundId } = useParams()
  const { grounds, loading: groundsLoading } = useMyGrounds()
  const groundMatches = useGroundMatches(publicGroundId)
  const { matches, loading, error, creating, createError, create, refresh } = groundMatches
  const slotsHook = useMatchUmpireSlots(publicGroundId)
  const [showForm, setShowForm] = useState(false)

  // Match Permission UX — MATCH_VIEW alone (no MATCH_MANAGE) is a real,
  // Owner-granted staff configuration; hide create/start/complete/fee/
  // payment-status actions rather than showing them and letting the
  // existing backend 403 (groundOwner.routes.js) surprise the user. Owner
  // routes (isStaffContext false) always get full access, unchanged.
  const isStaffContext = useLocation().pathname.startsWith('/staff/')
  const { memberships } = useMyGroundStaffMemberships(isStaffContext)
  const membership = isStaffContext ? memberships.find((m) => m.publicGroundId === publicGroundId) : null
  const canManageMatches = !isStaffContext || hasStaffPermission(membership, 'MATCH_MANAGE')
  // `grounds` below comes from useMyGrounds() (GET /ground-owner/grounds),
  // which only ever returns grounds the caller OWNS — always empty for a
  // staff viewer. The below "Create Match" gate can't read ground.status
  // for staff, so it defers to the backend's own identical, authoritative
  // check (createGroundMatch throws if the ground isn't ACTIVE) instead of
  // hiding the button outright.

  const ground = grounds.find((g) => g.public_ground_id === publicGroundId)

  return (
    <GroundOwnerLayout>
      <div className="lg:flex lg:items-start lg:gap-6">
        <GroundNavTabs />

        <div className="min-w-0 flex-1">
      <h1 className="mt-4 text-3xl font-extrabold text-white sm:text-4xl">
        {isStaffContext ? membership?.groundName || 'Ground' : groundsLoading ? 'Loading…' : ground?.name || 'Ground'}
      </h1>

      <UmpireOperationsSummaryPanel publicGroundId={publicGroundId} />

      <div className="mt-6 flex items-center justify-between">
        <h2 className="text-xl font-semibold text-white">Matches</h2>
        {canManageMatches && (isStaffContext || ground?.status === 'ACTIVE') && (
          <button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            className="rounded-full bg-emerald-500 px-4 py-2 text-xs font-semibold text-emerald-950 transition-colors hover:bg-emerald-400"
          >
            {showForm ? 'Cancel' : '+ Create Match'}
          </button>
        )}
      </div>

      {canManageMatches && ground && ground.status !== 'ACTIVE' && (
        <p className="mt-2 text-sm text-amber-300">
          This ground is {ground.status.toLowerCase()} — matches can't be created for it until it's active.
        </p>
      )}

      {canManageMatches && showForm && <CreateMatchForm onCreate={create} creating={creating} createError={createError} onDone={() => setShowForm(false)} />}

      <div className="mt-4">
        {loading && (
          <div className="grid gap-4 sm:grid-cols-2">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="h-40 animate-pulse rounded-[1.5rem] border border-white/10 bg-white/5" />
            ))}
          </div>
        )}
        {!loading && error && <StatsErrorState message={error} onRetry={refresh} />}
        {!loading && !error && matches.length === 0 && (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-white/10 bg-white/5 px-6 py-16 text-center">
            <CalendarDays className="h-8 w-8 text-slate-500" />
            <p className="text-slate-300">No matches at this ground yet.</p>
          </div>
        )}
        {!loading && !error && matches.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2">
            {matches.map((match) => (
              <MatchCard
                key={match.id}
                publicGroundId={publicGroundId}
                match={match}
                slotsHook={slotsHook}
                lifecycleHook={groundMatches}
                canManage={canManageMatches}
              />
            ))}
          </div>
        )}
      </div>
        </div>
      </div>
    </GroundOwnerLayout>
  )
}
