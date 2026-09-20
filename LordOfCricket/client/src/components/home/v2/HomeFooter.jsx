import { Link } from 'react-router-dom'

const YEAR = new Date().getFullYear()

const LINKS = [
  { label: 'Home', to: '/' },
  { label: 'Grounds', to: '/grounds' },
  { label: 'Matches', to: '/matches' },
  { label: 'Teams', to: '/teams' },
  { label: 'Players', to: '/players' },
  { label: 'Tournaments', to: '/tournaments' },
  { label: 'Merchandise', to: '/merchandise' },
]

export default function HomeFooter() {
  return (
    <footer className="border-t border-green-800 bg-green-950 text-white">
      <div className="mx-auto flex min-h-16 w-full max-w-[1400px] flex-col items-center justify-between gap-4 px-5 py-4 sm:flex-row sm:px-6 lg:px-8">
        <Link to="/" className="flex shrink-0 items-center gap-2 no-underline">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-loc-green-bright text-lg">🏏</div>
          <span className="text-lg font-bold text-white">LOC</span>
        </Link>

        <nav className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
          {LINKS.map((link) => (
            <Link key={link.to} to={link.to} className="text-sm text-green-200 no-underline transition hover:text-white">
              {link.label}
            </Link>
          ))}
        </nav>

        <p className="shrink-0 text-xs text-green-300 sm:text-sm">© {YEAR} LOC</p>
      </div>
    </footer>
  )
}
