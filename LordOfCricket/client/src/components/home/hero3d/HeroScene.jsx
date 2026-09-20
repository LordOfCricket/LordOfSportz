import { useEffect, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import CameraRig from './CameraRig.jsx'
import LightingRig from './LightingRig.jsx'
import usePointerCapability from '../../../hooks/usePointerCapability.js'

/**
 * The actual R3F root, lazily imported by Hero.jsx as its own
 * chunk (`lazy(() => import('./hero3d/HeroScene.jsx'))`). Everything this
 * file imports — Canvas, three, drei, the rig components — bundles into
 * that same chunk; nothing here is imported anywhere else in the app, so
 * none of it can leak into the main bundle or block first paint.
 *
 * Transparent canvas (`gl={{ alpha: true }}`), no environment/background
 * node of its own — the existing BackgroundSystem is the
 * environment this scene sits inside, not a second parallel one.
 *
 * Mobile strategy (device-capability tier, not a blanket phone exclusion):
 * Hero.jsx already gates *whether this file is ever imported at all* on
 * useWebGLCapability() (WebGL support + a low-end hardware heuristic) and
 * reduced-motion. Once mounted, this component reuses the EXISTING
 * usePointerCapability() hover-capability signal — not a new detector —
 * as a coarse desktop-vs-touch proxy: hover-capable devices get the full
 * [1,2] DPR range, touch-capable-but-still-approved devices are capped at
 * a flat DPR of 1 (the "simplified scene"). The other half of the
 * simplification — no mouse parallax on touch — comes for free from
 * CameraRig's useHeroParallax3D, since MouseParallaxProvider's `enabled`
 * is already this exact same signal; no separate logic needed here.
 *
 * "Render only when needed": an IntersectionObserver on this component's
 * own wrapper toggles the Canvas's `frameloop` between 'always' (Hero
 * visible — the idle breathing needs continuous frames) and 'never' (Hero
 * scrolled out of view — the render loop fully stops, zero GPU cost)
 * rather than fighting continuous breathing with a manual demand/
 * invalidate loop, which isn't a good fit for an always-animating camera.
 */
export default function HeroScene() {
  const canHover = usePointerCapability()
  const dpr = canHover ? [1, 2] : 1

  const wrapperRef = useRef(null)
  const [isVisible, setIsVisible] = useState(true)

  useEffect(() => {
    const el = wrapperRef.current
    if (!el || typeof IntersectionObserver === 'undefined') return undefined
    const observer = new IntersectionObserver(([entry]) => setIsVisible(entry.isIntersecting), { threshold: 0 })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={wrapperRef} className="absolute inset-0">
      {/* R3F's Canvas sets its own inline pointer-events:auto on an internal
          wrapper div, which breaks the pointer-events:none Hero.jsx's outer
          wrapper otherwise establishes for this whole layer — explicit here
          so the canvas stays click-through, matching this scene's decorative
          (aria-hidden) intent. */}
      <Canvas
        dpr={dpr}
        gl={{ alpha: true, antialias: true }}
        frameloop={isVisible ? 'always' : 'never'}
        style={{ pointerEvents: 'none' }}
      >
        <CameraRig />
        <LightingRig />
      </Canvas>
    </div>
  )
}
