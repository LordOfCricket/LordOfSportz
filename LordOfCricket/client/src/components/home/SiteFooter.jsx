import { Link } from 'react-router-dom'
import logo from '../../assets/logo.png'

// Only real routes — no invented URLs. There's no /about, /contact, /help,
// /privacy, or /terms page yet (and no social links exist anywhere in this
// app), so the brief's "Support" column and social row are simply omitted
// rather than shipping dead links or placeholder icons.
const LOC_LINKS = [
  { label: 'Home', to: '/' },
  { label: 'Players', to: '/players' },
  { label: 'Teams', to: '/teams' },
  { label: 'Matches', to: '/matches' },
  { label: 'Tournaments', to: '/tournaments' },
  { label: 'Leaderboards', to: '/leaderboards' },
  { label: 'Records', to: '/records' },
]

// `theme` — 'dark' (default, legacy) or 'light' (passed by migrated pages).
export default function SiteFooter({ theme = 'dark' }) {
  const light = theme === 'light'
  return (
    <footer
      className={`relative border-t px-6 py-6 lg:px-10 ${
        light ? 'border-loc-border bg-loc-mint' : 'border-emerald-400/10 bg-loc-dark/60'
      }`}
    >
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-center gap-x-8 gap-y-4 sm:justify-between">
        <Link to="/" aria-label="LOC — Lord Of Cricket home" className="shrink-0">
          <img
            src={logo}
            alt="LOC - Lord Of Cricket"
            className="h-10 w-auto"
            style={light ? undefined : { filter: 'drop-shadow(0 0 1.2px rgba(243,241,231,0.9)) drop-shadow(0 0 1.2px rgba(243,241,231,0.9))' }}
          />
        </Link>

        <nav
          aria-label="Footer"
          className={`flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm ${light ? 'text-loc-muted' : 'text-emerald-100/60'}`}
        >
          {LOC_LINKS.map((link) => (
            <Link key={link.to} to={link.to} className={`transition-colors ${light ? 'hover:text-loc-navy' : 'hover:text-white'}`}>
              {link.label}
            </Link>
          ))}
        </nav>

        <p className={`shrink-0 text-xs ${light ? 'text-loc-faint' : 'text-emerald-100/40'}`}>
          © {new Date().getFullYear()} LOC — Lord Of Cricket. All rights reserved.
        </p>
      </div>
    </footer>
  )
}
