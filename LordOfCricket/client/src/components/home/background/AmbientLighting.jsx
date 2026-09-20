/**
 * Layer 2 — one large, very slow-moving soft light sweep, suggesting a
 * distant floodlight beam drifting along the stadium roofline. Deliberately
 * a single element: this is atmosphere, not a light show.
 *
 * Two stacked radials, not one: a tighter cool-white core (what a real
 * floodlight's center actually looks like) inside the original wider gold
 * halo — same footprint/animation/opacity as before, just a more accurate
 * light color instead of a solid gold wash.
 */
export default function AmbientLighting() {
  return (
    <div
      className="loc-bg-light-sweep absolute -top-1/4 left-1/2 h-[70vh] w-[140vw] -translate-x-1/2 opacity-25 blur-2xl sm:opacity-40 sm:blur-3xl"
      style={{
        background: [
          'radial-gradient(ellipse 32% 45% at 50% 0%, color-mix(in srgb, white 45%, transparent), transparent 55%)',
          'radial-gradient(ellipse 50% 60% at 50% 0%, color-mix(in srgb, var(--color-loc-gold) 16%, transparent), transparent 70%)',
        ].join(','),
      }}
    />
  )
}
