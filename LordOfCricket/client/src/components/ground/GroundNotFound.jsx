import { Link } from 'react-router-dom'

// A ground id that doesn't exist (or is DRAFT/SUSPENDED,
// which the API 404s identically) must never fall back to
// showing the real seeded ground or auto-redirect anywhere. Styled to match
// the router-level NotFoundPage.jsx for visual consistency.
export default function GroundNotFound() {
  return (
    <div className="loc-page mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-4 px-6 text-center">
      <span className="loc-eyebrow">404</span>
      <h1 className="loc-heading text-3xl sm:text-4xl">Ground not found</h1>
      <p className="text-loc-muted">This ground doesn't exist, or isn't publicly available right now.</p>
      <Link
        to="/"
        className="loc-btn mt-2"
      >
        Find Cricket Grounds
      </Link>
    </div>
  )
}
