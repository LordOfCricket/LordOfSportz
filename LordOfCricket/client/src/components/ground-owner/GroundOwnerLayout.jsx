import { useLocation } from 'react-router-dom'
import GroundOwnerSidebar from './GroundOwnerSidebar.jsx'

// Mirrors AdminLayout.jsx/UmpireLayout.jsx exactly.
export default function GroundOwnerLayout({ title, subtitle, children }) {
  // Staff Dashboard reuse — GroundMatchesPage wraps itself in this layout and
  // is reused verbatim under /staff/grounds/:publicGroundId/matches.
  // GroundOwnerSidebar only offers Owner-only destinations (Dashboard, Browse
  // Umpires), so it's skipped in staff context; GroundNavTabs (rendered by
  // the page itself, inside children) already provides staff-appropriate
  // navigation. Every existing Owner URL is unaffected (isStaffContext is
  // always false there).
  const isStaffContext = useLocation().pathname.startsWith('/staff/')
  return (
    <main
      className="min-h-screen bg-cover bg-center bg-no-repeat text-white"
      style={{
        backgroundImage: `
          linear-gradient(
            rgba(2,6,23,0.78),
            rgba(2,6,23,0.78)
          ),
          url('/images/cricket-stadium.jpg')
        `,
      }}
    >
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-10 sm:px-6 lg:flex-row lg:px-8">
        {!isStaffContext && <GroundOwnerSidebar />}

        <div className="min-w-0 flex-1">
          {(title || subtitle) && (
            <div className="mb-6">
              {title && <h1 className="text-3xl font-extrabold text-white sm:text-4xl">{title}</h1>}
              {subtitle && <p className="mt-3 text-slate-300">{subtitle}</p>}
            </div>
          )}
          {children}
        </div>
      </div>
    </main>
  )
}
