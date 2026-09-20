// Pairs with useGlowHover() — reads the CSS custom properties that hook
// sets on the card's ref via direct style mutation. Purely decorative,
// pointer-events-none so it never intercepts the card's own click/hover.
export default function GlowOverlay() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 rounded-[inherit] transition-opacity duration-300"
      style={{
        opacity: 'var(--loc-glow-opacity, 0)',
        background: 'radial-gradient(circle at var(--loc-glow-x, 50%) var(--loc-glow-y, 50%), rgba(255,255,255,0.06), transparent 60%)',
      }}
    />
  )
}
