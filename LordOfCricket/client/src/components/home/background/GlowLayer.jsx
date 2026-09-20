// #16303d is a desaturated night-blue used only for this one atmospheric
// accent — deliberately NOT added to the shared --color-loc-* token set in
// index.css, since it's not a brand color, just background dressing.
const NIGHT_BLUE = '#16303d'

/**
 * Layer 3 — soft, slowly pulsing glow orbs. Same three anchor points the
 * homepage's old static blur blobs used (top-left / mid-right / bottom-
 * left), now animated and no longer all the same green — one grass, one
 * gold, one cool night-blue — so the page doesn't read as "all emerald."
 * The third orb is desktop-only (mobile keeps two, see index.css note on
 * the general "fewer/lighter on mobile" approach).
 *
 * NEW — a fourth, cool-white orb (top-right, also desktop-only) rounds out
 * the requested grass/gold/blue/white blend; existing three orbs are
 * unchanged.
 */
export default function GlowLayer() {
  return (
    <>
      <div
        className="loc-bg-glow-orb absolute -top-32 -left-32 h-72 w-72 rounded-full blur-2xl sm:h-96 sm:w-96 sm:blur-3xl"
        style={{ background: 'color-mix(in srgb, var(--color-loc-grass) 22%, transparent)' }}
      />
      <div
        className="loc-bg-glow-orb loc-bg-glow-orb--delay-1 absolute top-1/3 -right-32 h-72 w-72 rounded-full blur-2xl sm:h-96 sm:w-96 sm:blur-3xl"
        style={{ background: 'color-mix(in srgb, var(--color-loc-gold) 14%, transparent)' }}
      />
      <div
        className="loc-bg-glow-orb loc-bg-glow-orb--delay-2 absolute bottom-0 left-1/4 hidden h-96 w-96 rounded-full blur-3xl sm:block"
        style={{ background: `color-mix(in srgb, ${NIGHT_BLUE} 55%, transparent)` }}
      />
      <div
        className="loc-bg-glow-orb loc-bg-glow-orb--delay-3 absolute top-0 right-1/4 hidden h-64 w-64 rounded-full blur-3xl sm:block"
        style={{ background: 'color-mix(in srgb, white 26%, transparent)' }}
      />
    </>
  )
}
