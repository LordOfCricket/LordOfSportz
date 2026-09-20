import StaffSidebar from './StaffSidebar.jsx'

// Mirrors GroundOwnerLayout.jsx/AdminLayout.jsx/UmpireLayout.jsx exactly —
// same background/shell, just StaffSidebar instead of GroundOwnerSidebar.
// Only used by StaffDashboardPage itself; the per-ground pages it drills
// into (GroundMatchesPage etc.) keep their own existing shell.
export default function StaffLayout({ title, subtitle, children }) {
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
        <StaffSidebar />

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
