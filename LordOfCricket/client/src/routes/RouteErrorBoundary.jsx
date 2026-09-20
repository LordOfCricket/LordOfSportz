import { Link, useRouteError } from 'react-router-dom'

// Without an errorElement, an uncaught render/loader
// error on any route falls through to React Router's own default error
// screen (a bare, unstyled dump), and a network blip (ERR_FAILED, etc.)
// during route transition had no recovery path other than a manual
// full-page reload. Never shown for handled API errors — those already
// have their own in-page error states (StatsErrorState and friends); this
// only catches what those don't.
export default function RouteErrorBoundary() {
  const error = useRouteError()

  return (
    <div className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-4 px-6 text-center">
      <span className="text-sm font-semibold uppercase tracking-widest text-emerald-400">Something went wrong</span>
      <h1 className="text-3xl font-bold text-white sm:text-4xl">This page hit an unexpected error</h1>
      <p className="text-emerald-100/60">Please try reloading the page. If the problem continues, head back to the homepage.</p>
      {import.meta.env.DEV && error?.message && (
        <p className="max-w-full overflow-x-auto rounded-lg bg-black/30 p-3 text-left font-mono text-xs text-red-300">{error.message}</p>
      )}
      <div className="mt-2 flex gap-3">
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-full border border-white/20 px-6 py-2.5 font-semibold text-white transition hover:bg-white/10"
        >
          Reload
        </button>
        <Link
          to="/"
          className="rounded-full bg-emerald-500 px-6 py-2.5 font-semibold text-emerald-950 transition hover:bg-emerald-400"
        >
          Back to Home
        </Link>
      </div>
    </div>
  )
}
