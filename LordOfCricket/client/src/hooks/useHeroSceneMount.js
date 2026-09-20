import { useEffect, useState } from 'react'
import { useReducedMotion } from 'motion/react'
import useWebGLCapability from './useWebGLCapability.js'

// Extracted from Hero.jsx (the original mount-decision logic) so the
// new platform-level hero can reuse the exact same "when is it safe/worth it
// to mount the 3D scene" decision instead of a second copy of it.
// Unsupported/low-end devices (useWebGLCapability) and reduced-motion users
// never download the three.js chunk at all; approved devices still defer
// the dynamic import until the browser is idle after first paint, so the 3D
// scene can never delay a hero's own content from appearing.
export default function useHeroSceneMount() {
  const reduceMotion = useReducedMotion()
  const webglCapable = useWebGLCapability()
  const [sceneReady, setSceneReady] = useState(false)

  useEffect(() => {
    if (!webglCapable || reduceMotion) return undefined
    let cancelled = false
    const idleId = window.requestIdleCallback
      ? window.requestIdleCallback(() => {
          if (!cancelled) setSceneReady(true)
        })
      : setTimeout(() => {
          if (!cancelled) setSceneReady(true)
        }, 200)
    return () => {
      cancelled = true
      if (window.requestIdleCallback && window.cancelIdleCallback) window.cancelIdleCallback(idleId)
      else clearTimeout(idleId)
    }
  }, [webglCapable, reduceMotion])

  return { showScene: webglCapable && !reduceMotion && sceneReady, reduceMotion }
}
