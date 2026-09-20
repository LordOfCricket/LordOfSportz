import { NavLink, useNavigate } from 'react-router-dom'
import { LayoutDashboard, LogOut } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth.js'
import NotificationBell from '../layout/NotificationBell.jsx'

// Mirrors GroundOwnerSidebar.jsx exactly (same chrome/spacing), minimal link
// set — the Staff Dashboard IS the ground list + per-ground drill-in (same
// "dashboard is the ground list" shape GroundOwnerSidebar already uses), so
// there is nothing else to link to at this top level.
const LINKS = [{ to: '/staff/dashboard', label: 'Dashboard', icon: LayoutDashboard }]

export default function StaffSidebar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <aside className="flex w-full flex-col gap-6 rounded-[32px] border border-white/15 bg-slate-900/45 p-6 shadow-2xl backdrop-blur-2xl lg:w-72 lg:shrink-0">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-400">🧑‍💼 Ground Staff</p>
          <p className="mt-1 text-lg font-bold text-white">{user?.name}</p>
        </div>
        <NotificationBell />
      </div>

      <nav className="flex flex-col gap-2">
        {LINKS.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold transition ${
                isActive ? 'bg-green-600 text-white' : 'text-slate-200 hover:bg-white/10'
              }`
            }
          >
            <Icon size={18} />
            {label}
          </NavLink>
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
