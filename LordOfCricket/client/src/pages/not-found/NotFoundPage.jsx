import { Link } from 'react-router-dom'

// There was no catch-all route at all: an unmatched
// URL (a stale bookmark, a typo, a dead link) rendered a blank page inside
// Layout's <Outlet/> with no explanation and no way back, since React
// Router doesn't render anything of its own for a route that matches
// nothing.
export default function NotFoundPage() {
  return (
    <div className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-4 px-6 text-center">
      <span className="text-sm font-semibold uppercase tracking-widest text-emerald-400">404</span>
      <h1 className="text-3xl font-bold text-white sm:text-4xl">Page not found</h1>
      <p className="text-emerald-100/60">The page you're looking for doesn't exist or may have moved.</p>
      <Link
        to="/"
        className="mt-2 rounded-full bg-emerald-500 px-6 py-2.5 font-semibold text-emerald-950 transition hover:bg-emerald-400"
      >
        Back to Home
      </Link>
    </div>
  )
}
