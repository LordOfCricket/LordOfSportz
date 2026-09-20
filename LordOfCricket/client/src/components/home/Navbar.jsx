import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence, useReducedMotion } from 'motion/react'
import { Menu, X, ArrowRight } from 'lucide-react'
import logo from '../../assets/logo.png'
import { useAuth } from '../../hooks/useAuth.js'
import NotificationBell from '../layout/NotificationBell.jsx'
import AccountMenu from '../layout/AccountMenu.jsx'
import { EASE, SPRING } from '../../lib/motion.js'
import useMagneticHover from '../../hooks/useMagneticHover.js'
import { getPrimaryNavLinks } from '../../models/navLinks.model.js'

// `theme` — 'dark' (default, legacy) or 'light' (LOC light theme, passed by
// migrated public pages). Only palette classes switch; structure, motion,
// links and behaviour are identical.
const cta = (theme) =>
  `group inline-flex h-11 items-center gap-2 rounded-sm px-5 font-loc-display text-[13px] font-semibold tracking-[0.03em] uppercase transition-colors duration-200 ${
    theme === 'light'
      ? 'bg-loc-green text-white hover:bg-loc-green-strong'
      : 'bg-loc-stadium text-loc-warmwhite hover:bg-loc-stadium-hover'
  }`

function MagneticCta({ to, theme, children }) {
  const { enabled, style, onPointerMove, onPointerLeave } = useMagneticHover()

  if (!enabled) {
    return (
      <Link to={to} className={cta(theme)}>
        {children}
      </Link>
    )
  }

  return (
    <motion.span className="inline-block" style={style} onPointerMove={onPointerMove} onPointerLeave={onPointerLeave}>
      <Link to={to} className={cta(theme)}>
        {children}
      </Link>
    </motion.span>
  )
}

const NAV_LINKS = [
  { label: 'Home', to: '/', end: true },
  { label: 'Grounds', to: '/grounds' },
  { label: 'Matches', to: '/matches' },
  { label: 'Players', to: '/players' },
  { label: 'Teams', to: '/teams' },
  { label: 'Tournaments', to: '/tournaments' },
]

function NavItem({ link, theme = 'dark', onClick, className = '', activeClassName = '', underline = true }) {
  const light = theme === 'light'
  return (
    <NavLink
      to={link.to}
      end={link.end}
      onClick={onClick}
      className={({ isActive }) =>
        `relative font-loc-body text-[15px] font-medium tracking-wide transition-colors duration-200 ${
          isActive
            ? `${light ? 'text-loc-navy' : 'text-loc-warmwhite'} ${activeClassName}`
            : light
              ? 'text-loc-muted hover:text-loc-navy'
              : 'text-loc-text2-dark hover:text-loc-warmwhite'
        } ${className}`
      }
    >
      {({ isActive }) => (
        <>
          {link.label}
          {underline && isActive && (
            <motion.span
              layoutId="loc-nav-underline"
              className={`absolute inset-x-0 -bottom-1.5 h-[2px] rounded-full ${light ? 'bg-loc-green' : 'bg-loc-gold'}`}
              transition={SPRING}
            />
          )}
        </>
      )}
    </NavLink>
  )
}

export default function Navbar({ theme = 'dark' }) {
  const light = theme === 'light'
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const { user, player, logout } = useAuth()
  const navigate = useNavigate()
  const reduceMotion = useReducedMotion()
  const panelRef = useRef(null)
  const toggleRef = useRef(null)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    if (!menuOpen) return undefined

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const onKeyDown = (event) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)

    const focusTimer = window.setTimeout(() => {
      panelRef.current?.querySelector('a, button')?.focus()
    }, reduceMotion ? 0 : 260)

    const triggerEl = toggleRef.current

    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', onKeyDown)
      window.clearTimeout(focusTimer)
      triggerEl?.focus()
    }
  }, [menuOpen, reduceMotion])

  const handleLogout = () => {
    logout()
    setMenuOpen(false)
    navigate('/')
  }

  const panelTransition = { duration: reduceMotion ? 0 : 0.28, ease: EASE }
  const navLinks = getPrimaryNavLinks(user, NAV_LINKS)

  const barSurface = light
    ? scrolled
      ? 'border-loc-border bg-loc-surface/95 shadow-lg shadow-emerald-900/5 lg:bg-loc-surface/95'
      : 'border-loc-border/60 bg-loc-surface/80 lg:bg-loc-surface/80'
    : scrolled
      ? 'border-white/12 bg-loc-dark/90 shadow-lg shadow-black/30 lg:bg-loc-dark/90'
      : 'border-white/6 bg-loc-dark/55 lg:bg-loc-dark/55'

  return (
    <motion.header
      initial={reduceMotion ? undefined : { opacity: 0 }}
      animate={reduceMotion ? undefined : { opacity: 1 }}
      transition={{ duration: 0.4, ease: EASE }}
      className="fixed inset-x-0 top-0 z-50 lg:top-4 lg:px-4"
    >
      <div
        className={`mx-auto grid h-15 w-full max-w-300 grid-cols-[auto_1fr_auto] items-center gap-4 border px-5 backdrop-blur-md transition-all duration-300 lg:h-18 lg:rounded-2xl lg:px-8 lg:backdrop-blur-lg ${
          light ? 'lg:border-loc-border' : 'lg:border-white/8'
        } ${barSurface}`}
      >
        <Link to="/" className="flex h-full items-center" aria-label="LOC — Lord Of Cricket home">
          <img
            src={logo}
            alt=""
            className="h-12 w-auto lg:h-16"
            style={light ? undefined : { filter: 'drop-shadow(0 0 1.2px rgba(243,241,231,0.9)) drop-shadow(0 0 1.2px rgba(243,241,231,0.9))' }}
          />
        </Link>

        <nav aria-label="Primary" className="hidden justify-center lg:flex">
          <div className="flex items-center gap-9">
            {navLinks.map((link) => (
              <NavItem key={link.label} link={link} theme={theme} />
            ))}
          </div>
        </nav>

        <div className={`hidden items-center gap-5 lg:flex ${light ? 'text-loc-navy' : ''}`}>
          {user ? (
            <>
              <NotificationBell />
              <AccountMenu user={user} player={player} onLogout={handleLogout} />
            </>
          ) : (
            <>
              <Link
                to="/login"
                className={`font-loc-body text-[15px] font-medium transition-colors duration-200 ${
                  light ? 'text-loc-muted hover:text-loc-navy' : 'text-loc-text2-dark hover:text-loc-warmwhite'
                }`}
              >
                Sign In
              </Link>
              <MagneticCta to="/login" theme={theme}>
                Get Started
                <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
              </MagneticCta>
            </>
          )}
        </div>

        <button
          ref={toggleRef}
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
          aria-controls="loc-mobile-nav"
          className={`inline-flex h-11 w-11 items-center justify-center rounded-sm transition-colors lg:hidden ${
            light ? 'text-loc-navy hover:bg-loc-mint' : 'text-loc-warmwhite hover:bg-white/10'
          }`}
        >
          {menuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      <AnimatePresence>
        {menuOpen && (
          <motion.div
            key="loc-mobile-backdrop"
            aria-hidden="true"
            onClick={() => setMenuOpen(false)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={panelTransition}
            className="fixed inset-0 top-15 z-40 bg-black/40 lg:hidden"
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {menuOpen && (
            <motion.div
              key="loc-mobile-panel"
              id="loc-mobile-nav"
              ref={panelRef}
              role="dialog"
              aria-modal="true"
              aria-label="Mobile navigation"
              initial={{ opacity: 0, y: reduceMotion ? 0 : -12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: reduceMotion ? 0 : -12 }}
              transition={panelTransition}
              className={`fixed inset-x-0 top-15 z-40 max-h-[calc(100dvh-60px)] overflow-y-auto border-t px-5 pt-4 pb-8 lg:hidden ${
                light ? 'border-loc-border bg-loc-surface' : 'border-white/8 bg-loc-dark'
              }`}
            >
              {user && (
                <div
                  className={`mb-2 flex items-center gap-3 rounded-sm border px-4 py-4 ${
                    light ? 'border-loc-border bg-loc-mint' : 'border-white/8 bg-loc-card-dark'
                  }`}
                >
                  <div className="min-w-0">
                    <p className={`truncate font-loc-body text-base font-semibold ${light ? 'text-loc-navy' : 'text-loc-warmwhite'}`}>{user.name}</p>
                    <p className={`text-xs ${light ? 'text-loc-muted' : 'text-loc-muted-dark'}`}>Signed in</p>
                  </div>
                </div>
              )}

              <div className="flex flex-col">
                {navLinks.map((link) => (
                  <NavItem
                    key={link.label}
                    link={link}
                    theme={theme}
                    underline={false}
                    onClick={() => setMenuOpen(false)}
                    className="rounded-sm px-3 py-4 text-lg"
                    activeClassName={light ? 'bg-loc-mint' : 'bg-white/5'}
                  />
                ))}
              </div>

              <div className={`mt-4 flex flex-col gap-3 border-t pt-4 ${light ? 'border-loc-border' : 'border-white/8'}`}>
                {user ? (
                  <>
                    <div className="flex items-center gap-3">
                      <NotificationBell />
                      <span className={`font-loc-body text-sm ${light ? 'text-loc-muted' : 'text-loc-text2-dark'}`}>Notifications</span>
                    </div>
                    <button
                      type="button"
                      onClick={handleLogout}
                      className={`inline-flex h-12 items-center justify-center rounded-sm border font-loc-display text-[13px] font-semibold tracking-[0.03em] uppercase ${
                        light ? 'border-loc-border text-loc-navy' : 'border-white/12 text-loc-warmwhite'
                      }`}
                    >
                      Log Out
                    </button>
                  </>
                ) : (
                  <>
                    <Link
                      to="/login"
                      onClick={() => setMenuOpen(false)}
                      className={`inline-flex h-12 items-center justify-center rounded-sm border font-loc-display text-[13px] font-semibold tracking-[0.03em] uppercase ${
                        light ? 'border-loc-border text-loc-navy' : 'border-white/12 text-loc-warmwhite'
                      }`}
                    >
                      Sign In
                    </Link>
                    <Link
                      to="/login"
                      onClick={() => setMenuOpen(false)}
                      className={`inline-flex h-12 items-center justify-center gap-2 rounded-sm font-loc-display text-[13px] font-semibold tracking-[0.03em] uppercase ${
                        light ? 'bg-loc-green text-white' : 'bg-loc-stadium text-loc-warmwhite'
                      }`}
                    >
                      Get Started
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </>
                )}
              </div>
            </motion.div>
        )}
      </AnimatePresence>
    </motion.header>
  )
}
