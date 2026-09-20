// `motion-safe:` already gates the pulse on prefers-reduced-motion at the
// CSS level — no useReducedMotion() needed here. The "LIVE" text label is
// the actual live signal; the dot is decorative reinforcement only, so
// nothing here depends on color alone (a11y).
export default function LiveDot({ label = 'Live', className = '' }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border border-rose-400/30 bg-rose-500/10 px-2.5 py-1 font-loc-display text-[10px] font-bold tracking-[0.14em] text-rose-300 uppercase ${className}`}
    >
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-rose-400 motion-safe:animate-pulse" />
      {label}
    </span>
  )
}
