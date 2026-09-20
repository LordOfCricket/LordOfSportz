import {
  LayoutDashboard,
  User,
  UserCircle,
  Users,
  CalendarDays,
  CalendarCheck,
  BarChart3,
  UtensilsCrossed,
  Settings,
  Search,
  Trophy,
  ClipboardList,
  CalendarClock,
  MapPinned,
  Wallet,
  Gift,
  LandPlot,
} from 'lucide-react'

// Dedicated Umpire Workspace — the login mode ("Player Login" vs "Umpire
// Login") isn't a new stored concept: player_type is already the live,
// backend-authoritative signal for which experience a role='player' user
// should see (isApprovedUmpireUser itself requires player_type='umpire' at
// request time, not just historical approval — see
// server/src/models/umpireRequest.model.js). Reusing it here means the nav
// branch can never drift from what the backend would actually authorize.
export function isUmpireMode(user) {
  return user?.role === 'player' && user?.player_type === 'umpire'
}

// Mirrors the isStaff check in getAccountLinks below — exported so
// AccountMenu.jsx can decide the ground-owner-vs-staff menu branch without
// duplicating the literal role check.
export function isStaffMode(user) {
  return user?.role === 'staff'
}

// The primary Navbar's own nav-links row (Grounds/Matches/Players/Teams/
// Tournaments in components/home/Navbar.jsx) is player/general LOC
// navigation — none of it is relevant once someone is using LOC as an
// umpire. Umpire Mode gets exactly one persistent item instead, so the
// workspace reads as a clearly different mode rather than "the normal
// navbar with an extra button". Reused by both the desktop nav row and the
// mobile panel (same function, same array) so the two surfaces can never
// drift apart.
export const UMPIRE_PRIMARY_NAV_LINKS = [{ label: 'Grounds for Umpire', to: '/umpire/find-matches' }]

export function getPrimaryNavLinks(user, defaultLinks) {
  return isUmpireMode(user) ? UMPIRE_PRIMARY_NAV_LINKS : defaultLinks
}

// The umpire-only account menu — deliberately NOT a superset/subset of
// getAccountLinks(user); an approved umpire should see a completely
// separate, focused workspace menu, not the player menu with an extra item
// bolted on (that was the bug this phase fixes).
// Umpire Communication & Commercial 2.0 — "My Earnings" added as its own
// workspace destination (Workstream P), not folded into My Statistics —
// commercial data is a distinct concern from officiating performance.
export function getUmpireAccountLinks() {
  return [
    { label: 'View Dashboard', to: '/umpire/dashboard', icon: LayoutDashboard },
    { label: 'My Profile', to: '/umpire/profile', icon: UserCircle },
    { label: 'Grounds for Umpire', to: '/umpire/find-matches', icon: MapPinned },
    { label: 'My Matches', to: '/umpire/my-assignments', icon: CalendarCheck },
    { label: 'My Statistics', to: '/umpire/statistics', icon: BarChart3 },
    { label: 'My Earnings', to: '/umpire/earnings', icon: Wallet },
    // Umpire Proposals — Ground-Owner-initiated invitations, its own
    // workspace destination alongside My Matches (a proposal is not yet an
    // assignment until accepted).
    { label: 'Proposals', to: '/umpire/proposals', icon: Gift },
  ]
}

// Ground Owner Menu Cleanup — a ground owner's account menu was previously
// the full player menu (My Teams/My Matches/My Statistics/Players/
// Leaderboards/My Bookings/Settings) with "Ground Owner Dashboard" bolted on
// at the end. All ground management (grounds, staff, bookings, canteen,
// analytics) lives inside the dashboard itself (see AppRoutes.jsx
// /ground-owner/*), so the profile menu only needs to get them there —
// Logout is rendered separately in AccountMenu.jsx for every mode.
export function getGroundOwnerAccountLinks() {
  return [{ label: 'Ground Owner Dashboard', to: '/ground-owner/dashboard', icon: LandPlot }]
}

// Ground-Level Staff Dashboard — mirrors getGroundOwnerAccountLinks' minimal
// pattern: a dedicated, cut-down menu rather than the legacy staff menu
// (getAccountLinks below), which sent this account type to unrelated
// single-canteen/global pages (/canteen/staff, /bookings/staff, /canteen)
// with no ground-scoped destination at all. My Profile reuses the existing
// generic /profile page (RequireAuth-only) — no dedicated staff profile page.
export function getGroundStaffAccountLinks() {
  return [
    { label: 'Staff Dashboard', to: '/staff/dashboard', icon: LayoutDashboard },
    { label: 'My Profile', to: '/profile', icon: User },
  ]
}

// The account nav was previously one static list for every
// logged-in user, which sent staff to `/player/dashboard` (a page for a
// player profile staff accounts don't have) and never surfaced the match
// operations hub to staff or approved umpires at all. `user` is the auth
// context's user (role/player_type), not the player profile.
export function getAccountLinks(user) {
  const isStaff = user?.role === 'staff'
  const isSuperAdminOrAdmin = isStaff && ['super_admin', 'admin'].includes(user?.staff_role)
  // Final Whole-Project Audit — Super Admin previously also got "Manage
  // Matches" here (staff_role === 'super_admin'), promoting the live
  // match-scorer into primary navigation for a platform administrator. The
  // backend's own super-admin scoring bypass (matchScorerAccess.js) is a
  // separate, deliberate, unchanged capability — this only removes the
  // nav-level promotion, matching the real Umpire role's own link below.
  const isScorer = user?.player_type === 'umpire'

  const links = [
    isStaff
      ? { label: 'Staff Dashboard', to: isSuperAdminOrAdmin ? '/admin/dashboard' : '/canteen/staff', icon: LayoutDashboard }
      : { label: 'View Dashboard', to: '/player/dashboard', icon: LayoutDashboard },
  ]

  if (!isStaff) {
    links.push(
      { label: 'My Profile', to: '/profile', icon: User },
      { label: 'My Teams', to: '/player/dashboard#teams', icon: Users },
      { label: 'My Matches', to: '/player/dashboard#matches', icon: CalendarDays },
      { label: 'My Statistics', to: '/player/dashboard#career', icon: BarChart3 },
    )
  }

  if (isScorer) {
    links.push({ label: 'Manage Matches', to: '/umpire', icon: ClipboardList })
  }

  links.push(
    { label: 'Players', to: '/players', icon: Search },
    { label: 'Leaderboards', to: '/leaderboards', icon: Trophy },
    // Staff manage the ground's whole schedule (bookings +
    // blocks); everyone else only ever sees their own bookings.
    isStaff ? { label: 'Ground Bookings', to: '/bookings/staff', icon: CalendarClock } : { label: 'My Bookings', to: '/bookings', icon: CalendarClock },
  )

  // CUSTOMER_CANTEEN_MIGRATION — a generic, ground-less "Canteen" link is
  // only meaningful for canteen staff (-> /canteen/staff, their real
  // workspace). For a player it used to route through CanteenEntryRedirect
  // to getPostAuthPath, which sends a player to /player/dashboard — a dead
  // link in practice. Customer ordering is ground-contextual now (a real
  // "Order Food" entry point lives on each ground's own page), so this link
  // stays staff-only rather than pointing somewhere that was never actually
  // useful for a player.
  if (isStaff) {
    links.push({ label: 'Canteen', to: '/canteen', icon: UtensilsCrossed })
  }

  if (!isStaff) {
    links.push({ label: 'Settings', to: '/profile/edit', icon: Settings })
  }

  return links
}
