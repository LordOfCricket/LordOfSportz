import { NavLink, useNavigate } from 'react-router-dom'
import { Flag, LogOut } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth.js'
import { getUmpireAccountLinks } from '../../models/navLinks.model.js'
import NotificationBell from '../layout/NotificationBell.jsx'

// Mirrors AdminSidebar.jsx's shell/shape, but the link set is the same
// single source of truth AccountMenu uses (getUmpireAccountLinks) — the
// sidebar and the account dropdown must never drift into two different
// umpire menus.
export default function UmpireSidebar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const links = getUmpireAccountLinks()

  const handleLogout = () => {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <aside className="flex w-full flex-col gap-6 rounded-[32px] border border-white/10 bg-loc-card-dark/70 p-6 shadow-2xl shadow-black/40 backdrop-blur-2xl lg:w-72 lg:shrink-0">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-loc-gold/15">
            <Flag className="h-4 w-4 text-loc-gold" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-loc-muted-dark">Umpire Workspace</p>
            <p className="mt-0.5 truncate font-loc-display text-lg font-bold tracking-wide text-loc-warmwhite">{user?.name}</p>
          </div>
        </div>
        <NotificationBell />
      </div>

      <nav className="flex flex-col gap-1.5">
        {links.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold transition-colors ${
                isActive ? 'bg-loc-gold text-loc-dark shadow-md shadow-loc-gold/20' : 'text-loc-text2-dark hover:bg-white/5 hover:text-loc-warmwhite'
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
        className="mt-auto flex items-center gap-3 rounded-2xl border border-white/10 px-4 py-3 text-sm font-semibold text-loc-text2-dark transition-colors hover:border-white/20 hover:bg-white/5 hover:text-loc-warmwhite"
      >
        <LogOut size={18} />
        Logout
      </button>
    </aside>
  )
}
