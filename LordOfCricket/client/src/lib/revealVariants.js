import { EASE } from './motion.js'

/**
 * Scroll-reveal variant library. Each homepage section gets its
 * own entrance "personality" (per the cinematic-scroll brief: no two
 * sections should move identically), all built from the same EASE curve
 * Hero/Navbar/GroundGallery's entrance animations already use so the whole
 * page reads as one motion language, not several unrelated effects.
 *
 * Consumed via ScrollReveal.jsx (`initial="hidden"` / `whileInView="visible"`)
 * and StaggerItem.jsx (inherits the parent's state, no viewport trigger of
 * its own).
 */

export const fadeUp = {
  hidden: { opacity: 0, y: 28 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.7, ease: EASE } },
}

export const fadeUpSoft = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: EASE } },
}

// Map card — reveals a beat after the About text/stats beside it.
export const mapReveal = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, delay: 0.15, ease: EASE } },
}

// Match Activity — energetic, but restrained (no aggressive movement).
export const energeticReveal = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } },
}

// Booking — the CTA. A single, slightly stronger entrance stands in for a
// "spotlight" without adding a separate lighting effect.
export const spotlightReveal = {
  hidden: { opacity: 0, y: 36, scale: 0.96 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.8, ease: EASE } },
}

// Footer — atmosphere gently settles. Fade only, no rise.
export const settleFade = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.8, ease: EASE } },
}

/**
 * Stagger container — pairs with StaggerItem children. `staggerChildren`
 * lets each grid (Amenities/Partners/Match cards) pick its own cadence
 * instead of sharing one global rhythm.
 */
export function staggerContainer(staggerChildren = 0.08, delayChildren = 0) {
  return {
    hidden: {},
    visible: { transition: { staggerChildren, delayChildren } },
  }
}

// Amenities / match cards — clean, small-distance rise.
export const staggerItemUp = {
  hidden: { opacity: 0, y: 18 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } },
}

// Partners — premium feel, a hint of scale instead of a plain rise.
export const staggerItemScale = {
  hidden: { opacity: 0, y: 14, scale: 0.94 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.55, ease: EASE } },
}
