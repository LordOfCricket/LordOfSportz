import { useEffect, useMemo } from 'react'
import { useMotionValue, useReducedMotion, useSpring, useTransform } from 'motion/react'
import { BRIGHTNESS_STOPS, SCENE_STOPS, TINT_STOPS } from '../lib/environmentTimeline.js'
import { ScrollEnvironmentContext } from './scrollEnvironmentContext.js'

/**
 * One shared whole-page scroll-progress source feeding the
 * background's environmental grading (BackgroundSystem's ScrollAtmosphere +
 * EnvironmentTint). A direct `window` scroll listener, not framer-motion's
 * own `useScroll()` — that hook doesn't track this page's Lenis-driven
 * scroll reliably here (its `scrollYProgress` stayed
 * pinned at its mount-time value under Lenis's `root` mode). ScrollAtmosphere
 * previously carried its own copy of this exact listener; this
 * provider replaces it as the ONE shared source, so a second consumer
 * (EnvironmentTint) doesn't need a second listener.
 *
 * Scoped inside BackgroundSystem.jsx only — nothing outside the background
 * system needs scroll-driven environment values, so this stays
 * out of HomePage.jsx entirely.
 */
export function ScrollEnvironmentProvider({ children }) {
  const reduceMotion = useReducedMotion()
  const rawProgress = useMotionValue(0)
  const progress = useSpring(rawProgress, { stiffness: 60, damping: 20, mass: 0.5 })
  const brightness = useTransform(progress, SCENE_STOPS, BRIGHTNESS_STOPS)
  const tint = useTransform(progress, SCENE_STOPS, TINT_STOPS)

  useEffect(() => {
    if (reduceMotion) return undefined

    const updateProgress = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight
      rawProgress.set(max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0)
    }

    updateProgress()
    window.addEventListener('scroll', updateProgress, { passive: true })
    window.addEventListener('resize', updateProgress)
    return () => {
      window.removeEventListener('scroll', updateProgress)
      window.removeEventListener('resize', updateProgress)
    }
  }, [reduceMotion, rawProgress])

  const value = useMemo(
    () => ({ progress, brightness, tint, enabled: !reduceMotion }),
    [progress, brightness, tint, reduceMotion],
  )

  return <ScrollEnvironmentContext.Provider value={value}>{children}</ScrollEnvironmentContext.Provider>
}
