import { useEffect, useRef } from 'react'
import usePointerCapability from './usePointerCapability.js'

/**
 * Page-wide pointer position, raw viewport-relative pixels, as a ref —
 * never React state, so a mousemove never triggers a re-render. Consumers
 * read `.current` inside their own requestAnimationFrame loop (see
 * CursorGlow.jsx). Distinct from useMouseParallax()/MouseParallaxContext,
 * which tracks pointer position normalized to Hero's own bounding box
 * (Hero is that system's deliberate "source" element) — this hook tracks
 * the whole page instead, for effects that need to work while scrolled
 * past Hero too.
 *
 * Gated by the same usePointerCapability() every interaction
 * uses (fine pointer + hover-capable + not prefers-reduced-motion): when
 * disabled, the `mousemove` listener is never attached at all, so mobile/
 * touch/reduced-motion users pay zero extra JS cost, not just a hidden
 * visual result.
 */
export default function usePointerPosition() {
  const enabled = usePointerCapability()
  const position = useRef({ x: 0, y: 0 })

  useEffect(() => {
    if (!enabled) return undefined
    const onMove = (event) => {
      position.current.x = event.clientX
      position.current.y = event.clientY
    }
    window.addEventListener('mousemove', onMove, { passive: true })
    return () => window.removeEventListener('mousemove', onMove)
  }, [enabled])

  return { position, enabled }
}
