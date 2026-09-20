import { useCallback, useMemo } from 'react'
import { useMotionValue, useSpring } from 'motion/react'
import usePointerCapability from '../hooks/usePointerCapability.js'
import { MouseParallaxContext } from './mouseParallaxContext.js'

// Gentle, not snappy — this spring is what makes the movement read as
// "effortless" rather than "cursor chasing." Shared by every consumer so
// the whole Hero settles in sync.
const SPRING = { stiffness: 150, damping: 20, mass: 0.5 }

/**
 * Wraps BackgroundSystem + Hero (see HomePage.jsx). Owns the shared,
 * springed pointer MotionValues (normalized -1..1, never React state — a
 * mouse move here never triggers a re-render) plus the pointer-move/leave
 * handlers Hero's root section attaches to actually source them. Every
 * consumer (background layers, Hero panels) reads the SAME x/y via
 * useMouseParallax() instead of attaching its own listener.
 */
export function MouseParallaxProvider({ children }) {
  const enabled = usePointerCapability()
  const rawX = useMotionValue(0)
  const rawY = useMotionValue(0)
  const x = useSpring(rawX, SPRING)
  const y = useSpring(rawY, SPRING)

  const onPointerMove = useCallback(
    (event) => {
      const rect = event.currentTarget.getBoundingClientRect()
      rawX.set(((event.clientX - rect.left) / rect.width) * 2 - 1)
      rawY.set(((event.clientY - rect.top) / rect.height) * 2 - 1)
    },
    [rawX, rawY],
  )

  const onPointerLeave = useCallback(() => {
    rawX.set(0)
    rawY.set(0)
  }, [rawX, rawY])

  const value = useMemo(
    () => ({ x, y, enabled, onPointerMove, onPointerLeave }),
    [x, y, enabled, onPointerMove, onPointerLeave],
  )

  return <MouseParallaxContext.Provider value={value}>{children}</MouseParallaxContext.Provider>
}
