import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown, LandPlot, LogOut } from 'lucide-react'
import Avatar from '../ui/Avatar.jsx'
import { roleLabel } from '../../models/player.model.js'
import {
  getAccountLinks,
  getUmpireAccountLinks,
  getGroundOwnerAccountLinks,
  getGroundStaffAccountLinks,
  isUmpireMode,
  isStaffMode,
} from '../../models/navLinks.model.js'
import { useIsGroundOwner } from '../../hooks/useIsGroundOwner.js'
import { useMyGroundStaffMemberships } from '../../hooks/useMyGroundStaffMemberships.js'

export default function AccountMenu({ user, player, onLogout }) {
  const umpireMode = isUmpireMode(user)
  // Not part of getAccountLinks (that function is synchronous — user.role/
  // player_type only; ground ownership has no such signal on the user
  // object) — U5's own self-check, same "fetch quietly in the navbar"
  // posture NotificationBell already has.
  const isGroundOwner = useIsGroundOwner(Boolean(user))
  // Ground Owner Menu Cleanup — a plain ground owner (not also staff or an
  // approved umpire) gets the dedicated, cut-down menu instead of the full
  // player menu. Staff/umpire accounts that also own a ground keep their
  // existing role menu unchanged, with Ground Owner Dashboard still added
  // on below (see the block after MENU_LINKS).
  const groundOwnerMode = isGroundOwner && !umpireMode && !isStaffMode(user)
  // Ground-Level Staff Dashboard — a ground_users staff (GROUND_ADMIN/
  // CANTEEN_STAFF) row can belong to EITHER a brand-new dedicated account
  // (role='staff', staff_role=null, created via groundStaff.service.js#
  // createStaffForGround) OR an existing player/user account a Ground Owner
  // added by their existing email/phone (createStaffForGround reuses the
  // found account as-is — never rewrites its role). users.role can't tell
  // these apart, so — same reasoning as isGroundOwner above — this is a real
  // membership self-check, not a synchronous role check. Previously such an
  // account had no ground-scoped destination at all: a dedicated staff
  // account fell into getAccountLinks(user)'s generic isStaff branch
  // (legacy single-canteen/global links), and an existing player/user
  // account had no staff menu section whatsoever.
  const { memberships: staffMemberships } = useMyGroundStaffMemberships(Boolean(user))
  const groundStaffMode = staffMemberships.length > 0 && !groundOwnerMode && !umpireMode
  const MENU_LINKS = groundOwnerMode
    ? getGroundOwnerAccountLinks()
    : groundStaffMode
      ? getGroundStaffAccountLinks()
      : umpireMode
        ? getUmpireAccountLinks()
        : getAccountLinks(user)
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)

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

  const firstName = user?.name?.split(' ')[0] || 'Player'
  const role = roleLabel(player?.role)

  const handleLogout = () => {
    setOpen(false)
    onLogout()
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 py-1.5 pl-1.5 pr-3 transition-colors hover:border-white/20 hover:bg-white/10"
      >
        <Avatar name={user?.name} photoUrl={player?.photo_url} size="sm" />
        <span className="text-sm font-semibold text-white">{firstName}</span>
        <ChevronDown className={`h-4 w-4 text-emerald-100/70 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-2xl border border-white/10 bg-emerald-950/95 shadow-xl shadow-black/30 backdrop-blur-xl">
          <div className="flex items-center gap-3 border-b border-white/10 px-4 py-4">
            <Avatar name={user?.name} photoUrl={player?.photo_url} size="lg" />
            <div className="min-w-0">
              <p className="truncate text-base font-bold text-white">{user?.name}</p>
              {!umpireMode && player?.public_player_id && (
                <p className="text-xs font-semibold tracking-wide text-emerald-300">{player.public_player_id}</p>
              )}
              <p className="text-xs text-emerald-100/60">{umpireMode ? 'Approved Umpire' : role || 'Complete your profile to set a role'}</p>
            </div>
          </div>

          <div className="py-2">
            {MENU_LINKS.map((link) => {
              const Icon = link.icon
              return (
                <Link
                  key={link.label}
                  to={link.to}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-emerald-100/80 transition-colors hover:bg-white/5 hover:text-white"
                >
                  <Icon className="h-4 w-4 text-emerald-300" />
                  {link.label}
                </Link>
              )
            })}
          </div>

          {isGroundOwner && !groundOwnerMode && (
            <div className="border-t border-white/10 py-2">
              <Link
                to="/ground-owner/dashboard"
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-emerald-100/80 transition-colors hover:bg-white/5 hover:text-white"
              >
                <LandPlot className="h-4 w-4 text-emerald-300" />
                Ground Owner Dashboard
              </Link>
            </div>
          )}

          <div className="border-t border-white/10 py-2">
            <button
              type="button"
              onClick={handleLogout}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm font-medium text-rose-300 transition-colors hover:bg-white/5 hover:text-rose-200"
            >
              <LogOut className="h-4 w-4" />
              Logout
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
