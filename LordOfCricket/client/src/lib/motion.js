/**
 * Shared `motion/react` presets — the one place this project's entrance
 * animations define their easing/spring/transition values. Previously
 * duplicated as identical local consts in Hero.jsx, Navbar.jsx, and
 * GroundGallery.jsx; centralized here so new sections reuse the same feel
 * instead of re-declaring it.
 */

// "Expo out" curve every existing entrance/exit fade already uses.
export const EASE = [0.16, 1, 0.3, 1]

// Spring preset behind the Navbar's active-link underline (motion's layoutId).
export const SPRING = { type: 'spring', stiffness: 380, damping: 32 }

/**
 * Opacity + rise entrance variant — Hero's original reveal() shape, now
 * shared. Callers still decide whether to apply it at all under
 * `useReducedMotion()`; this only shapes what plays when motion is on.
 */
export function reveal(delay = 0, distance = 16) {
  return {
    initial: { opacity: 0, y: distance },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.5, delay, ease: EASE },
  }
}
