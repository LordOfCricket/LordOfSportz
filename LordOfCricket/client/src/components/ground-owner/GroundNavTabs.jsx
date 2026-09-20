import { useState } from 'react'
import { Link, useParams, useLocation } from 'react-router-dom'
import { Menu, ChevronDown, Swords, Settings, BarChart3, Star, UserCircle, Images, Sparkles, MapPin, CalendarClock, UtensilsCrossed, Users, IndianRupee } from 'lucide-react'
import BackButton from '../common/BackButton.jsx'
import { useMyGroundStaffMemberships } from '../../hooks/useMyGroundStaffMemberships.js'
import { getStaffVisibleTabLabels, getStaffCanteenHref } from '../../models/groundStaffNav.model.js'

const TABS = [
  { label: 'Matches', path: '', icon: Swords },
  { label: 'Operations', path: '/operations', icon: Settings },
  { label: 'Analytics', path: '/analytics', icon: BarChart3 },
  { label: 'Reviews', path: '/reviews', icon: Star },
  { label: 'Profile', path: '/profile', icon: UserCircle },
  { label: 'Photos & Gallery', path: '/media', icon: Images },
  { label: 'Amenities', path: '/amenities', icon: Sparkles },
  { label: 'Location', path: '/location', icon: MapPin },
  { label: 'Bookings', path: '/bookings', icon: CalendarClock },
  { label: 'Pricing', path: '/pricing', icon: IndianRupee },
  { label: 'Canteen', path: '/canteen', icon: UtensilsCrossed },
  { label: 'Staff', path: '/staff', icon: Users },
]

// Ground Owner Navigation Sidebar Conversion — was a horizontal, overflow-x
// scrolling tab bar (11 items across every ground-detail page); converted
// to a vertical sidebar so long labels like "Photos & Gallery" never force
// horizontal scroll. Same TABS/href/active-match logic as before, just
// rendered as a column. Below `lg:`, this collapses to a "Sections"
// accordion instead of a permanent sidebar so it never eats the content
// area on small screens.
export default function GroundNavTabs({ backLabel, backFallback }) {
  const { publicGroundId } = useParams()
  const location = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)

  // Staff Dashboard reuse — the exact same page components (GroundMatchesPage,
  // GroundBookingPage, GroundCanteenPage, etc.) are mounted a second time
  // under /staff/grounds/:publicGroundId/... for ground_users staff. This is
  // the ONE place that tells the difference, so those pages themselves never
  // need to know or change: an Owner URL always renders every tab exactly as
  // before (isStaffContext is false there), a /staff/ URL gets a
  // permission-filtered subset with staff-appropriate back/home links.
  const isStaffContext = location.pathname.startsWith('/staff/')
  const { memberships } = useMyGroundStaffMemberships(isStaffContext)
  const membership = isStaffContext ? memberships.find((m) => m.publicGroundId === publicGroundId) : null

  const basePath = isStaffContext ? '/staff/grounds' : '/ground-owner/grounds'
  const resolvedBackLabel = backLabel ?? (isStaffContext ? 'Back to Staff Dashboard' : 'Back to Dashboard')
  const resolvedBackFallback = backFallback ?? (isStaffContext ? '/staff/dashboard' : '/ground-owner/dashboard')
  const visibleTabs = isStaffContext ? TABS.filter((tab) => getStaffVisibleTabLabels(membership).includes(tab.label)) : TABS

  const items = visibleTabs.map((tab) => {
    const href =
      isStaffContext && tab.label === 'Canteen'
        ? getStaffCanteenHref(membership, publicGroundId)
        : `${basePath}/${publicGroundId}${tab.path}`
    const isActive = location.pathname === href
    const Icon = tab.icon
    return (
      <Link
        key={tab.path}
        to={href}
        onClick={() => setMobileOpen(false)}
        className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
          isActive ? 'bg-green-600 text-white' : 'text-slate-300 hover:bg-white/10 hover:text-white'
        }`}
      >
        <Icon className="h-4 w-4 shrink-0" />
        {tab.label}
      </Link>
    )
  })

  return (
    <>
      {/* Mobile / tablet — collapsible "Sections" panel instead of a permanent column */}
      <div className="mb-6 lg:hidden">
        <button
          type="button"
          onClick={() => setMobileOpen((v) => !v)}
          aria-expanded={mobileOpen}
          className="flex w-full items-center justify-between rounded-2xl border border-white/10 bg-slate-900/60 px-4 py-3 text-sm font-semibold text-white"
        >
          <span className="flex items-center gap-2">
            <Menu className="h-4 w-4" />
            Sections
          </span>
          <ChevronDown className={`h-4 w-4 transition-transform ${mobileOpen ? 'rotate-180' : ''}`} />
        </button>
        {mobileOpen && (
          <nav className="mt-2 flex flex-col gap-1 rounded-2xl border border-white/10 bg-slate-900/60 p-3">
            <BackButton label={resolvedBackLabel} fallback={resolvedBackFallback} className="mb-1 w-full rounded-xl hover:bg-white/10" />
            <div className="my-1 border-t border-white/10" />
            {items}
          </nav>
        )}
      </div>

      {/* Desktop — permanent left sidebar */}
      <aside className="hidden shrink-0 flex-col gap-1 self-start rounded-2xl border border-white/10 bg-slate-900/60 p-3 backdrop-blur-xl lg:sticky lg:top-6 lg:flex lg:w-64">
        <BackButton label={resolvedBackLabel} fallback={resolvedBackFallback} className="mb-1 w-full rounded-xl hover:bg-white/10" />
        <div className="my-1 border-t border-white/10" />
        {items}
      </aside>
    </>
  )
}
