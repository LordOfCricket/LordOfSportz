import UmpireSidebar from './UmpireSidebar.jsx'
import BackButton from '../common/BackButton.jsx'

// LOC Design System — same warm charcoal/dark-green overlay tone as
// GroundDiscoveryCard/loc-bg-gradient-layer, replacing the old cool
// blue-black (rgba(2,6,23,...)) overlay that clashed with the loc-* cards
// this page renders. Container widened from max-w-7xl (1280px) to
// max-w-[1600px] so the sidebar sits noticeably closer to the real left
// edge of the viewport on typical/wide screens instead of floating
// centered with large empty gutters on both sides.
export default function UmpireLayout({ title, subtitle, children }) {
  return (
    <main
      className="min-h-screen bg-cover bg-center bg-no-repeat text-loc-warmwhite"
      style={{
        backgroundImage: `
          linear-gradient(
            rgba(14,18,16,0.85),
            rgba(14,18,16,0.85)
          ),
          url('/images/cricket-stadium.jpg')
        `,
      }}
    >
      <div className="mx-auto flex max-w-[1600px] flex-col gap-6 px-4 py-10 sm:px-6 lg:flex-row lg:px-6 xl:px-10">
        <UmpireSidebar />

        <div className="min-w-0 flex-1">
          <BackButton fallback="/umpire" className="mb-4" />

          {(title || subtitle) && (
            <div className="mb-6">
              {title && <h1 className="font-loc-display text-3xl font-bold tracking-wide text-loc-warmwhite sm:text-4xl">{title}</h1>}
              {subtitle && <p className="mt-3 text-loc-text2-dark">{subtitle}</p>}
            </div>
          )}
          {children}
        </div>
      </div>
    </main>
  )
}
