import { Suspense, lazy } from 'react'
import { motion } from 'motion/react'
import GroundGallery from './GroundGallery.jsx'
import LocMatchPanel from './LocMatchPanel.jsx'
import IndiaMatchPanel from './IndiaMatchPanel.jsx'
import BookStadiumPanel from './BookStadiumPanel.jsx'
import ParallaxLayer from '../common/ParallaxLayer.jsx'
import useMouseParallax from '../../hooks/useMouseParallax.js'
import useHeroSceneMount from '../../hooks/useHeroSceneMount.js'
import HeroSceneBoundary from './hero3d/HeroSceneBoundary.jsx'
import { reveal } from '../../lib/motion.js'

// Its own chunk, never bundled with Hero/HomePage. Import
// deferred until after first paint (see the idle-mount effect below), so
// this never competes with the critical render path.
const HeroScene = lazy(() => import('./hero3d/HeroScene.jsx'))

// Entrance sequence: background (instant) → gallery → LOC panel → India
// panel, a short cascade rather than a marketing reveal — the hero's job now
// is "show the ground and the scores fast", not stage a headline moment.
const DELAY = { gallery: 0.08, loc: 0.22, india: 0.32 }

export default function Hero({ ground, onViewGallery, onBook }) {
  const { showScene, reduceMotion } = useHeroSceneMount()
  const motionProps = (delay) => (reduceMotion ? {} : reveal(delay))
  // Hero is the pointer "source": one listener here drives the
  // shared parallax MotionValues that BackgroundSystem's layers and the
  // panels below all read from (see MouseParallaxContext.jsx).
  const { onPointerMove, onPointerLeave, enabled: parallaxEnabled } = useMouseParallax()

  return (
    <section
      className="relative flex min-h-dvh w-full flex-col overflow-hidden bg-loc-dark"
      onPointerMove={parallaxEnabled ? onPointerMove : undefined}
      onPointerLeave={parallaxEnabled ? onPointerLeave : undefined}
    >
      {/* Restrained atmosphere: real ground photography carries the visual
          weight now, so the backdrop stays quiet — a dark wash + one soft
          floodlight glow, nothing competing with the photo or the scores. */}
      <div className="absolute inset-0" aria-hidden="true">
        <div
          className="absolute inset-0"
          style={{
            background: [
              'radial-gradient(ellipse 55% 45% at 80% 0%, rgba(63,143,95,0.14), transparent 65%)',
              'linear-gradient(160deg, #10201a 0%, #0e1210 55%, #0a0d0b 100%)',
            ].join(','),
          }}
        />
        {!reduceMotion && (
          <motion.div
            className="absolute inset-0"
            style={{ background: 'radial-gradient(ellipse 45% 40% at 80% 0%, rgba(243,241,231,0.08), transparent 65%)' }}
            animate={{ opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
          />
        )}
      </div>

      {/* Hero 3D foundation. Sits above the CSS backdrop and
          below the content grid (z-10) purely by DOM order, matching the
          backdrop div's own convention of not needing an explicit
          z-index. Decorative only: pointer-events-none + aria-hidden, and
          HeroSceneBoundary means any WebGL/render failure silently falls
          back to nothing — the CSS backdrop above stands on its own. */}
      {showScene && (
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          <HeroSceneBoundary>
            <Suspense fallback={null}>
              <HeroScene />
            </Suspense>
          </HeroSceneBoundary>
        </div>
      )}

      <div className="relative z-10 flex flex-1 flex-col pt-20 pb-5 lg:pt-24 lg:pb-6">
        <div className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col justify-center px-4 sm:px-6 lg:px-8">
          {/* Strict 2:1 composition — gallery (2fr) beside a LOC/India stack
              (1fr) on desktop; gallery full-width above a 2-col LOC/India
              row on tablet; everything stacked on mobile, gallery first. */}
          <div className="grid grid-cols-1 gap-3 sm:gap-4 lg:h-140 lg:grid-cols-[2fr_1fr] lg:gap-5 xl:h-155">
            <motion.div {...motionProps(DELAY.gallery)} className="lg:h-full">
              <ParallaxLayer strength={10} tilt tiltStrength={3} className="lg:h-full">
                <GroundGallery className="lg:h-full" photos={ground.photos} groundName={ground.name} onViewGallery={onViewGallery} />
              </ParallaxLayer>
            </motion.div>

            <div className="flex flex-col gap-3 sm:gap-4 lg:gap-5">
              <motion.div {...motionProps(DELAY.gallery)}>
                <ParallaxLayer strength={6} tilt tiltStrength={2}>
                  <BookStadiumPanel groundName={ground.name} publicGroundId={ground.publicGroundId} onBook={() => onBook?.()} />
                </ParallaxLayer>
              </motion.div>
              <motion.div {...motionProps(DELAY.loc)}>
                <ParallaxLayer strength={6} tilt tiltStrength={2}>
                  <LocMatchPanel />
                </ParallaxLayer>
              </motion.div>
              <motion.div {...motionProps(DELAY.india)}>
                <ParallaxLayer strength={6} tilt tiltStrength={2}>
                  <IndiaMatchPanel />
                </ParallaxLayer>
              </motion.div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
