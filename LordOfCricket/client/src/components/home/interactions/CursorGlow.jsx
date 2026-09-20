import { useEffect, useRef, useState } from 'react'
import usePointerPosition from '../../../hooks/usePointerPosition.js'

// Lower = lazier follow, more visible "lag" — kept gentle so it reads as
// ambient light with weight, not a cursor-tracking dot.
const EASE = 0.07

/**
 * A soft, low-opacity glow that lazily follows the pointer across the
 * whole page — not just Hero, which already has its own depth response
 * via ParallaxLayer/tilt (see Hero.jsx). Mounted once in HomePage.jsx as
 * a sibling of BackgroundSystem, same `-z-10` tier: invisible within
 * Hero's own opaque backdrop (exactly like the rest of the atmosphere),
 * visible everywhere below it.
 *
 * requestAnimationFrame + refs only, per the performance brief:
 * usePointerPosition writes raw pixels to a ref on `mousemove` (no
 * re-render); this component reads that ref once a frame, eases toward it
 * with a simple lerp, and writes the result straight to the DOM node's
 * `transform` — no React state in the loop, no layout-triggering
 * properties (`transform`/`opacity` only).
 */
export default function CursorGlow() {
  const { position, enabled } = usePointerPosition()
  const elRef = useRef(null)
  const eased = useRef(null) // null until the pointer has actually moved once
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!enabled) return undefined

    let rafId
    const tick = () => {
      if (eased.current === null) {
        eased.current = { x: position.current.x, y: position.current.y }
      } else {
        eased.current.x += (position.current.x - eased.current.x) * EASE
        eased.current.y += (position.current.y - eased.current.y) * EASE
      }
      if (elRef.current) {
        elRef.current.style.transform = `translate3d(${eased.current.x}px, ${eased.current.y}px, 0) translate(-50%, -50%)`
      }
      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)

    // Reveal only once real pointer input arrives, so the glow never
    // flashes at (0,0) before the user has moved the mouse.
    const onFirstMove = () => setVisible(true)
    window.addEventListener('mousemove', onFirstMove, { once: true, passive: true })

    return () => {
      cancelAnimationFrame(rafId)
      window.removeEventListener('mousemove', onFirstMove)
    }
  }, [enabled, position])

  if (!enabled) return null

  return (
    <div
      ref={elRef}
      aria-hidden="true"
      className={`pointer-events-none fixed top-0 left-0 -z-10 h-105 w-105 rounded-full blur-3xl transition-opacity duration-700 ease-out ${
        visible ? 'opacity-60' : 'opacity-0'
      }`}
      style={{
        background: 'radial-gradient(circle, color-mix(in srgb, var(--color-loc-gold) 8%, transparent) 0%, transparent 70%)',
      }}
    />
  )
}
