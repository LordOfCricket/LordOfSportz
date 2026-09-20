// Shared visual shell for LocMatchPanel / IndiaMatchPanel — one surface
// treatment (dark translucent card, subtle border, small blur) so the two
// panels read as siblings, plus their loading/error fallbacks, so neither
// panel re-implements its own skeleton.

export function PanelSurface({ children, className = '' }) {
  return (
    <div
      className={`flex flex-col rounded-2xl border border-white/10 bg-loc-card-dark/80 p-5 shadow-lg shadow-black/30 backdrop-blur-sm transition-transform duration-300 hover:-translate-y-0.5 ${className}`}
    >
      {children}
    </div>
  )
}

export function PanelSkeleton({ className = '' }) {
  return (
    <PanelSurface className={`animate-pulse justify-center gap-3 ${className}`}>
      <div className="h-3 w-20 rounded-full bg-white/10" />
      <div className="h-9 w-32 rounded-md bg-white/10" />
      <div className="h-3 w-24 rounded-full bg-white/10" />
    </PanelSurface>
  )
}

export function PanelError({ message, className = '' }) {
  return (
    <PanelSurface className={`items-center justify-center gap-1.5 border-dashed text-center ${className}`}>
      <p className="font-loc-body text-sm text-loc-text2-dark">{message}</p>
    </PanelSurface>
  )
}
