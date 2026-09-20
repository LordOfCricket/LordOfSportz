import { Link } from 'react-router-dom'
import { motion, useReducedMotion } from 'motion/react'
import { ArrowRight } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth.js'
import useMouseParallax from '../../hooks/useMouseParallax.js'
import { reveal } from '../../lib/motion.js'
import heroImage from '../../assets/hero-cricket-players.png'

const DELAY = { eyebrow: 0.05, headline: 0.15, subtext: 0.3, ctaLabel: 0.35, cta: 0.42 }

const CTA_CLASSNAME =
  'group inline-flex h-14 items-center gap-2 rounded-sm bg-loc-stadium px-8 font-loc-display text-sm font-semibold tracking-[0.05em] text-loc-warmwhite uppercase shadow-lg shadow-black/30 transition-colors duration-200 hover:bg-loc-stadium-hover'

// Level 1 — the LOC PLATFORM hero. A real photographic backdrop (batsman
// vs. bowler, floodlit stadium) instead of the 3D cricket-ball scene —
// deliberate, requested swap for this component specifically; the 3D scene
// stays exactly as it was on the per-ground template (Hero.jsx). Split
// composition: hero copy on the left, a single "Join LOC" CTA on the
// right — the image's own negative space on both edges is what makes this
// layout work, so the photo is never covered by a text scrim.
export default function PlatformHero() {
  const reduceMotion = useReducedMotion()
  const motionProps = (delay) => (reduceMotion ? {} : reveal(delay, 20))
  const { user } = useAuth()
  // This hero's own content no longer reacts to the cursor (a real photo,
  // not the 3D scene) — but it's still the page's pointer "source" that
  // feeds BackgroundSystem's decorative parallax layers via
  // MouseParallaxProvider (see BackgroundSystem.jsx), so the listener stays.
  const { onPointerMove, onPointerLeave, enabled: parallaxEnabled } = useMouseParallax()

  return (
    <section
      className="relative flex min-h-dvh w-full flex-col overflow-hidden bg-loc-dark"
      onPointerMove={parallaxEnabled ? onPointerMove : undefined}
      onPointerLeave={parallaxEnabled ? onPointerLeave : undefined}
    >
      <motion.img
        src={heroImage}
        alt=""
        aria-hidden="true"
        // This is the hero's own LCP element now (no 3D scene competing for
        // attention) — eager, not lazy, with a priority hint.
        loading="eager"
        fetchPriority="high"
        initial={reduceMotion ? false : { scale: 1.06 }}
        animate={reduceMotion ? undefined : { scale: 1 }}
        transition={{ duration: 2.2, ease: [0.16, 1, 0.3, 1] }}
        className="absolute inset-0 h-full w-full object-cover object-center"
      />

      {/* Legibility scrim — heavier at the very top/bottom and along the
          text columns, transparent through the middle where the players
          themselves carry the composition. The source photo is very wide
          (both players are only ~35-60% in from each edge); on a narrow
          mobile viewport object-cover crops most of that width away, so
          mobile gets a materially heavier overall wash — the image reads
          as atmosphere there rather than a precise composition, which is
          the safer choice since exactly what survives the crop can't be
          verified without a browser (a disclosed
          testing gap). Desktop keeps a lighter touch since the full width,
          and both players, are actually visible there. */}
      <div aria-hidden="true" className="absolute inset-0 bg-loc-dark/55 lg:bg-transparent" />
      <div aria-hidden="true" className="absolute inset-0 bg-linear-to-t from-loc-dark via-loc-dark/25 to-loc-dark/70 lg:via-loc-dark/10 lg:to-loc-dark/60" />
      <div aria-hidden="true" className="absolute inset-0 bg-linear-to-r from-loc-dark/85 via-transparent to-loc-dark/70 lg:from-loc-dark/80 lg:via-transparent lg:to-loc-dark/55" />

      <div className="relative z-10 grid flex-1 grid-cols-1 items-center gap-10 px-6 pt-28 pb-16 sm:px-10 lg:grid-cols-2 lg:gap-6 lg:px-16 lg:pt-24">
        {/* Left — hero copy */}
        <div className="flex flex-col items-start text-left">
          <motion.span
            {...motionProps(DELAY.eyebrow)}
            className="font-loc-display text-xs font-bold tracking-[0.3em] text-loc-gold uppercase sm:text-sm"
          >
            The Digital Home of Cricket
          </motion.span>

          <motion.h1
            {...motionProps(DELAY.headline)}
            className="mt-5 font-loc-display text-5xl leading-[0.95] font-extrabold tracking-tight text-loc-warmwhite uppercase sm:text-6xl lg:text-7xl"
          >
            Where Cricket
            <br />
            Meets Data.
          </motion.h1>

          <motion.p {...motionProps(DELAY.subtext)} className="mt-6 max-w-md font-loc-body text-base text-loc-text2-dark sm:text-lg">
            Discover grounds, track performances, and experience cricket through a smarter, connected ecosystem.
          </motion.p>
        </div>

        {/* Right — join CTA, using the image's own open space on that side */}
        <div className="flex flex-col items-start gap-4 lg:items-end lg:text-right">
          <motion.span
            {...motionProps(DELAY.ctaLabel)}
            className="font-loc-display text-xs font-bold tracking-[0.3em] text-loc-gold uppercase sm:text-sm"
          >
            Ready To Play?
          </motion.span>
          <motion.div {...motionProps(DELAY.cta)}>
            {user ? (
              // Ground discovery now lives on its own page (/grounds — city
              // sort, landmark search, km radius) rather than a same-page
              // section here, so this is a real route change.
              // Phase 2 Cleanup — "Join LOC" is misleading for someone
              // already signed in; label only, same link/behavior.
              <Link to="/grounds" className={CTA_CLASSNAME}>
                Explore Grounds
                <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
              </Link>
            ) : (
              // New Signup Flow — was /login before that route existed;
              // "Join LOC" now goes straight to the dedicated signup page
              // rather than making a new visitor click through a login form
              // first (Sign In is still one click away from there).
              <Link to="/signup" className={CTA_CLASSNAME}>
                Join LOC
                <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
              </Link>
            )}
          </motion.div>
        </div>
      </div>
    </section>
  )
}
