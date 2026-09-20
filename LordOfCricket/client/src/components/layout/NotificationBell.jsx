import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Bell,
  Calendar,
  XCircle,
  AlertTriangle,
  Clock,
  UserCheck,
  UserX,
  ClipboardCheck,
  ShoppingBag,
  PackageX,
  ClipboardX,
  UserPlus,
  UserMinus,
  MegaphoneIcon,
  RefreshCw,
  Gift,
  PlayCircle,
} from 'lucide-react'
import { useNotifications } from '../../hooks/useNotifications.js'
import { useAuth } from '../../hooks/useAuth.js'
import { isUmpireMode } from '../../models/navLinks.model.js'

// Wired to the real, persisted, in-app notification
// store (ground_notifications). No email/SMS — every notification here is
// generated server-side: booking confirm/cancel (groundBooking.service.js,
// see docs/ARCHITECTURE.md), and umpire slot assign/
// cancel + umpire request decisions (U7 — umpireAssignment.service.js /
// umpireRequest.controller.js). Unrecognized types fall back to the plain
// Bell icon below, so a future notification type never needs a frontend
// change just to render.

const TYPE_ICON = {
  BOOKING_APPROVED: Calendar,
  BOOKING_CANCELLED: XCircle,
  BOOKING_REMINDER: Clock,
  GROUND_CLOSED: AlertTriangle,
  UMPIRE_SLOT_ASSIGNED: UserCheck,
  UMPIRE_SLOT_CANCELLED: UserX,
  UMPIRE_REQUEST_DECIDED: ClipboardCheck,
  UMPIRE_REPLACEMENT_ASSIGNED: RefreshCw,
  UMPIRE_NO_SHOW: UserX,
  UMPIRE_PROPOSAL_RECEIVED: Gift,
  UMPIRE_PROPOSAL_EXPIRED: Gift,
  UMPIRE_REMINDER_24H: Clock,
  UMPIRE_REMINDER_2H: Clock,
  UMPIRE_REMINDER_30M: Clock,
  MATCH_STARTING: PlayCircle,
  MATCH_CANCELLED: XCircle,
  // Phase 15 — Ground Owner notification types.
  GROUND_BOOKING_RECEIVED: Calendar,
  GROUND_BOOKING_CANCELLED: XCircle,
  GROUND_BOOKING_STATUS_CHANGED: ClipboardCheck,
  CANTEEN_ORDER_RECEIVED: ShoppingBag,
  CANTEEN_ORDER_STATUS_CHANGED: ShoppingBag,
  CANTEEN_LOW_STOCK: PackageX,
  CANTEEN_MENU_NOT_PUBLISHED: ClipboardX,
  GROUND_STAFF_ACTIVATED: UserPlus,
  GROUND_STAFF_DEACTIVATED: UserMinus,
  GROUND_OPERATIONAL_ALERT: MegaphoneIcon,
}

// Phase 15 — where a Ground-Owner-facing notification's "view" action goes.
// Deliberately a section, not a deep link to the exact booking/order row:
// the notification only carries the ground's public id (never an internal
// booking/order id — see groundNotification.repository.js's own comment),
// so this is the closest safe, correct destination.
const TYPE_ROUTE_SUFFIX = {
  GROUND_BOOKING_RECEIVED: '/bookings',
  GROUND_BOOKING_CANCELLED: '/bookings',
  GROUND_BOOKING_STATUS_CHANGED: '/bookings',
  CANTEEN_ORDER_RECEIVED: '/canteen',
  CANTEEN_ORDER_STATUS_CHANGED: '/canteen',
  CANTEEN_LOW_STOCK: '/canteen',
  CANTEEN_MENU_NOT_PUBLISHED: '/canteen',
  GROUND_STAFF_ACTIVATED: '/staff',
  GROUND_STAFF_DEACTIVATED: '/staff',
  GROUND_OPERATIONAL_ALERT: '/operations',
  // Phase 2 Cleanup — '' (no suffix) is deliberate, not an oversight:
  // /ground-owner/grounds/:publicGroundId with NO suffix IS the Matches tab
  // (GroundMatchesPage — matches the backend's own route exactly, see
  // AppRoutes.jsx's own comment), where both MatchChatPanel (MATCH_MESSAGE)
  // and this match's incident context (MATCH_INCIDENT_REPORTED) live. No
  // dedicated incidents page exists to route to instead — this is the
  // closest real page, not a fabricated one.
  MATCH_MESSAGE: '',
  MATCH_INCIDENT_REPORTED: '',
}

// Phase 2 (Umpire Interest+Assignment audit) — umpire-facing deep links.
// These notification `type` values are ALSO sent to the ground owner side
// of the same event (e.g. UMPIRE_SLOT_ASSIGNED fires for both the umpire
// AND the match's owner, with different title/body but the identical
// `type`), and the owner-facing rows carry no ground_public_id today (a
// real, separately-flagged gap — see Phase 2 report), so this map is only
// ever consulted when the viewer is confirmed to be in umpire mode
// (isUmpireMode) — never applied to a ground owner viewing the same type.
// Deliberately a section, not a per-match deep link, matching
// TYPE_ROUTE_SUFFIX's own "closest safe, correct destination" precedent.
// Player Role Audit — these 4 types are only ever created for the booking
// customer (groundBooking.service.js/bookingConflict.service.js#createNotification
// calls with userId, never ground_public_id), so — unlike TYPE_ROUTE_SUFFIX/
// UMPIRE_TYPE_ROUTE above — no role/mode check is needed here; a ground
// owner or umpire never receives these `type` values. Previously fell
// through to "mark read only," leaving a player's click with no visible
// effect. Same "closest safe section, not a fabricated per-booking deep
// link" precedent as TYPE_ROUTE_SUFFIX (a notification row carries no
// public_booking_id today).
const PLAYER_BOOKING_TYPE_ROUTE = {
  BOOKING_APPROVED: '/bookings',
  BOOKING_CANCELLED: '/bookings',
  BOOKING_REMINDER: '/bookings',
  GROUND_CLOSED: '/bookings',
  // Final Whole-Project Audit — a MATCH/PRACTICE proposal-confirmed booking
  // is deliberately excluded from GET /bookings/my (booking_type='CUSTOMER'
  // only, see groundBooking.repository.js#listByUser), so it never appears
  // on /bookings — routing there would show an empty/misleading page.
  // /team-bookings is the real destination for this booking type.
  PROPOSAL_ACCEPTED: '/team-bookings',
}

const UMPIRE_TYPE_ROUTE = {
  UMPIRE_SLOT_ASSIGNED: '/umpire/my-assignments',
  UMPIRE_SLOT_CANCELLED: '/umpire/my-assignments',
  UMPIRE_REQUEST_DECIDED: '/umpire',
  UMPIRE_REPLACEMENT_ASSIGNED: '/umpire/my-assignments',
  UMPIRE_NO_SHOW: '/umpire/my-assignments',
  UMPIRE_PROPOSAL_RECEIVED: '/umpire/proposals',
  UMPIRE_PROPOSAL_EXPIRED: '/umpire/proposals',
  UMPIRE_REMINDER_24H: '/umpire/my-assignments',
  UMPIRE_REMINDER_2H: '/umpire/my-assignments',
  UMPIRE_REMINDER_30M: '/umpire/my-assignments',
  MATCH_STARTING: '/umpire/my-assignments',
  MATCH_CANCELLED: '/umpire/my-assignments',
  // Final Whole-Project Audit — MATCH_COMPLETED is only ever sent to
  // assigned umpires (groundOwner.service.js#notifyAssignedUmpires, the same
  // umpire-only helper MATCH_STARTING above already uses) — no dual-audience
  // risk, same safe destination as the other match-lifecycle types.
  MATCH_COMPLETED: '/umpire/my-assignments',
  // Phase 2 Cleanup — the umpire-received copy of MATCH_MESSAGE carries no
  // groundId (see matchMessage.service.js#sendMessage), so it never matches
  // TYPE_ROUTE_SUFFIX above; this is its real destination — MatchChatPanel
  // is hosted on UmpireDashboardPage, not MyAssignmentsPage.
  MATCH_MESSAGE: '/umpire',
}

function timeAgo(iso) {
  const diffMs = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)
  const navigate = useNavigate()
  const { user } = useAuth()
  const { notifications, unreadCount, loading, error, markRead, markAllRead, reload } = useNotifications()

  // Phase 15 — navigate to the ground section this notification is about
  // (see TYPE_ROUTE_SUFFIX's own comment on why it's a section, not a deep
  // link). Notifications with no ground_public_id (every pre-Phase-15
  // type — umpire/match/customer-booking) fall through to the umpire-mode
  // check below, then finally to the original mark-read-only behavior.
  const handleNotificationClick = (n) => {
    if (!n.is_read) markRead(n.id)
    // Phase 2 Cleanup — `suffix != null` (not truthy-checked): '' is a
    // real, valid suffix (the Matches tab has none), and a bare `if
    // (suffix && ...)` would silently treat it as "no route," which is
    // exactly the class of bug this fix exists to close.
    const suffix = TYPE_ROUTE_SUFFIX[n.type]
    if (suffix != null && n.ground_public_id) {
      setOpen(false)
      navigate(`/ground-owner/grounds/${n.ground_public_id}${suffix}`)
      return
    }
    // Phase 2 — only ever taken when the viewer is themselves in umpire
    // mode, so a ground owner viewing this same notification `type` (see
    // UMPIRE_TYPE_ROUTE's own comment) is never sent to a /umpire/* route
    // they'd just get redirected away from.
    const umpireRoute = isUmpireMode(user) ? UMPIRE_TYPE_ROUTE[n.type] : null
    if (umpireRoute) {
      setOpen(false)
      navigate(umpireRoute)
      return
    }
    const playerBookingRoute = PLAYER_BOOKING_TYPE_ROUTE[n.type]
    if (playerBookingRoute) {
      setOpen(false)
      navigate(playerBookingRoute)
    }
  }

  useEffect(() => {
    if (!open) return
    const onClickOutside = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false)
    }
    const onEscape = (event) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    document.addEventListener('keydown', onEscape)
    return () => {
      document.removeEventListener('mousedown', onClickOutside)
      document.removeEventListener('keydown', onEscape)
    }
  }, [open])

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Notifications"
        aria-expanded={open}
        className="relative inline-flex h-11 w-11 items-center justify-center rounded-full text-emerald-100/80 transition-colors hover:bg-white/10 hover:text-white"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute right-1.5 top-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-2xl border border-white/10 bg-emerald-950/95 shadow-xl shadow-black/30 backdrop-blur-xl">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <p className="text-sm font-semibold text-white">Notifications</p>
            {unreadCount > 0 && (
              <button type="button" onClick={markAllRead} className="text-xs font-semibold text-emerald-300 hover:text-emerald-200">
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {loading && <div className="px-4 py-8 text-center text-sm text-emerald-100/60">Loading…</div>}
            {!loading && error && (
              <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
                <p className="text-sm text-rose-300">{error}</p>
                <button type="button" onClick={reload} className="text-xs font-semibold text-emerald-300 hover:text-emerald-200">
                  Retry
                </button>
              </div>
            )}
            {!loading && !error && notifications.length === 0 && <div className="px-4 py-8 text-center text-sm text-emerald-100/60">You're all caught up.</div>}
            {!loading &&
              !error &&
              notifications.map((n) => {
                const Icon = TYPE_ICON[n.type] || Bell
                return (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => handleNotificationClick(n)}
                    className={`flex w-full items-start gap-3 border-b border-white/5 px-4 py-3 text-left transition-colors last:border-0 hover:bg-white/5 ${n.is_read ? 'opacity-60' : ''}`}
                  >
                    <Icon className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-white">{n.title}</p>
                      {n.body && <p className="mt-0.5 line-clamp-2 text-xs text-emerald-100/70">{n.body}</p>}
                      <p className="mt-1 text-[11px] text-emerald-100/50">{timeAgo(n.created_at)}</p>
                    </div>
                    {!n.is_read && <span className="ml-auto mt-1.5 h-2 w-2 shrink-0 rounded-full bg-emerald-400" />}
                  </button>
                )
              })}
          </div>
        </div>
      )}
    </div>
  )
}
