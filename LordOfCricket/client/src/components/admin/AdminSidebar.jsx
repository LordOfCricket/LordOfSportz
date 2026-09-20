import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  ClipboardCheck,
  MapPinPlus,
  MapPinned,
  ShieldCheck,
  Users,
  Trophy,
  ClipboardList,
  Handshake,
  Sparkles,
  ShoppingBag,
  LogOut,
} from 'lucide-react'
import { useAuth } from '../../hooks/useAuth.js'
import { MERCHANDISE_CATEGORIES } from '../../lib/merchandiseCategories.js'

// Super Admin sidebar navigation cleanup + centralized Sponsors/Amenities
// Master — Edit Photos (unrouted dead link already), Admin Settings, and
// Create Staff were removed from primary nav here (their routes/pages stay
// registered and reachable — Admin Settings by direct URL, Create Staff via
// the Dashboard's own Quick Actions tile and from within Admin Settings
// itself). Sponsors (client/src/pages/admin-sponsors) and Amenities
// (client/src/pages/admin-amenities/AdminAmenityCatalogPage.jsx) are the
// new centralized content-management sections replacing them.
const LINKS = [
  { to: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard, allow: ['super_admin', 'admin'] },
  { to: '/admin/ground-registrations', label: 'Ground Requests', icon: MapPinPlus, allow: ['super_admin'] },
  { to: '/admin/all-grounds', label: 'All Grounds', icon: MapPinned, allow: ['super_admin'] },
  { to: '/admin/ground-owners', label: 'Ground Owners', icon: ShieldCheck, allow: ['super_admin'] },
  { to: '/admin/players', label: 'Players', icon: Users, allow: ['super_admin'] },
  { to: '/admin/umpires', label: 'Umpires', icon: Trophy, allow: ['super_admin'] },
  { to: '/admin/umpire-requests', label: 'Umpire Requests', icon: ClipboardCheck, allow: ['super_admin'] },
  { to: '/admin/sponsors', label: 'Sponsors', icon: Handshake, allow: ['super_admin'] },
  {
    to: '/admin/merchandise',
    label: 'Merchandise',
    icon: ShoppingBag,
    allow: ['super_admin'],
    children: MERCHANDISE_CATEGORIES.map((c) => ({ to: `/admin/merchandise/${c.slug}`, label: c.name })),
  },
  { to: '/admin/amenities', label: 'Amenities', icon: Sparkles, allow: ['super_admin'] },
  { to: '/security', label: 'Account Security', icon: ShieldCheck, allow: ['super_admin', 'admin'] },
  { to: '/admin/audit-log', label: 'Audit Logs', icon: ClipboardList, allow: ['super_admin'] },
]

export default function AdminSidebar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const links = LINKS.filter((link) => link.allow.includes(user?.staff_role))

  const handleLogout = () => {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <aside className="flex w-full flex-col gap-6 rounded-[32px] border border-white/15 bg-slate-900/45 p-6 shadow-2xl backdrop-blur-2xl lg:w-72 lg:shrink-0">
      <div>
        <p className="text-xs uppercase tracking-wide text-slate-400">Signed in as</p>
        <p className="mt-1 text-lg font-bold text-white">{user?.name}</p>
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-300">{user?.staff_role?.replace('_', ' ')}</p>
      </div>

      <nav className="flex flex-col gap-2">
        {links.map(({ to, label, icon: Icon, children }) => (
          <div key={to} className="flex flex-col gap-1">
            <NavLink
              to={to}
              end={Boolean(children)}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold transition ${
                  isActive ? 'bg-green-600 text-white' : 'text-slate-200 hover:bg-white/10'
                }`
              }
            >
              <Icon size={18} />
              {label}
            </NavLink>
            {children && (
              <div className="ml-6 flex flex-col gap-1 border-l border-white/10 pl-3">
                {children.map((child) => (
                  <NavLink
                    key={child.to}
                    to={child.to}
                    className={({ isActive }) =>
                      `rounded-xl px-3 py-2 text-xs font-semibold transition ${
                        isActive ? 'bg-green-600/80 text-white' : 'text-slate-300 hover:bg-white/10'
                      }`
                    }
                  >
                    {child.label}
                  </NavLink>
                ))}
              </div>
            )}
          </div>
        ))}
      </nav>

      <button
        type="button"
        onClick={handleLogout}
        className="mt-auto flex items-center gap-3 rounded-2xl border border-white/10 px-4 py-3 text-sm font-semibold text-slate-200 transition hover:bg-white/10"
      >
        <LogOut size={18} />
        Logout
      </button>
    </aside>
  )
}
