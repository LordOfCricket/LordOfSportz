import { useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { Search, Menu, X } from 'lucide-react'
import { useAuth } from '../../../hooks/useAuth.js'
import AccountMenu from '../../layout/AccountMenu.jsx'
import NotificationBell from '../../layout/NotificationBell.jsx'
import { getPrimaryNavLinks } from '../../../models/navLinks.model.js'

const NAV_LINKS = [
  { label: 'Home', to: '/', end: true },
  { label: 'Grounds', to: '/grounds' },
  { label: 'Matches', to: '/matches' },
  { label: 'Teams', to: '/teams' },
  { label: 'Players', to: '/players' },
  { label: 'Tournaments', to: '/tournaments' },
]

export default function HomeNavbar() {
  const [menuOpen, setMenuOpen] = useState(false)
  const { user, player, logout } = useAuth()
  const navigate = useNavigate()

  const navLinks = getPrimaryNavLinks(user, NAV_LINKS)

  const handleLogout = () => {
    logout()
    setMenuOpen(false)
    navigate('/')
  }

  const linkClass = ({ isActive }) =>
    `flex min-w-0 flex-1 items-center justify-center whitespace-nowrap rounded-full px-3 py-3 text-sm font-semibold transition-all ${
      isActive ? 'bg-loc-surface text-loc-green shadow-sm' : 'text-loc-ink hover:text-loc-green'
    }`

  return (
    <header className="w-full px-5 py-3 sm:px-6">
      <nav className="relative mx-auto flex w-full max-w-[1400px] min-h-[76px] items-center rounded-[18px] border border-loc-border bg-loc-surface px-7 shadow-sm">
        <Link to="/" className="flex shrink-0 items-center gap-3 no-underline" aria-label="LOC — Lord Of Cricket home">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-loc-green-bright text-2xl">🏏</div>
          <span className="text-[25px] font-bold text-loc-green-strong">LOC</span>
        </Link>

        <div className="ml-auto hidden min-w-0 flex-1 items-center justify-center lg:flex">
          <div className="flex w-full max-w-[700px] items-center rounded-full border border-loc-border bg-loc-mint/40 p-1">
            {navLinks.map((item) => (
              <NavLink key={item.label} to={item.to} end={item.end} className={linkClass}>
                {item.label}
              </NavLink>
            ))}
          </div>
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-2 lg:ml-3">
          <button
            type="button"
            aria-label="Search grounds"
            onClick={() => navigate('/grounds')}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-loc-border bg-loc-surface text-loc-green-strong transition hover:bg-loc-mint"
          >
            <Search size={21} />
          </button>

          {user ? (
            <div className="hidden items-center gap-2 lg:flex">
              <NotificationBell />
              <AccountMenu user={user} player={player} onLogout={handleLogout} />
            </div>
          ) : (
            <Link
              to="/login"
              className="hidden h-11 min-w-[76px] shrink-0 items-center justify-center rounded-full bg-loc-green-bright px-5 text-sm font-semibold text-white no-underline transition hover:bg-loc-green lg:flex"
            >
              Login
            </Link>
          )}

          <button
            type="button"
            aria-label="Toggle navigation menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((prev) => !prev)}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-loc-border bg-loc-surface text-loc-green-strong lg:hidden"
          >
            {menuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>

        {menuOpen && (
          <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-50 rounded-2xl border border-loc-border bg-loc-surface p-3 shadow-lg lg:hidden">
            <div className="flex flex-col gap-1">
              {navLinks.map((item) => (
                <NavLink
                  key={item.label}
                  to={item.to}
                  end={item.end}
                  onClick={() => setMenuOpen(false)}
                  className={({ isActive }) =>
                    `rounded-xl px-4 py-3 text-sm font-semibold no-underline ${
                      isActive ? 'bg-loc-mint text-loc-green' : 'text-loc-ink hover:bg-loc-mint'
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              ))}

              {user ? (
                <button
                  type="button"
                  onClick={handleLogout}
                  className="mt-2 rounded-xl border border-loc-border px-4 py-3 text-center text-sm font-semibold text-loc-ink"
                >
                  Log out
                </button>
              ) : (
                <Link
                  to="/login"
                  onClick={() => setMenuOpen(false)}
                  className="mt-2 rounded-xl bg-loc-green-bright px-4 py-3 text-center text-sm font-semibold text-white no-underline"
                >
                  Login
                </Link>
              )}
            </div>
          </div>
        )}
      </nav>
    </header>
  )
}
