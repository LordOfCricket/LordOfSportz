import useMouseParallax from './useMouseParallax.js'

/**
 * Bridges the existing MouseParallaxProvider into the R3F
 * tree. This is NOT a new pointer listener: `x`/`y` are the exact same
 * springed MotionValues Hero's DOM-side ParallaxLayer already reads. React
 * context propagates through <Canvas> normally (R3F's custom renderer
 * doesn't break the ancestor Provider chain), so CameraRig can call this
 * hook and read `.get()` on `x`/`y` inside its own `useFrame` loop —
 * no separate subscription or extra render is needed to keep them in sync.
 */
export default function useHeroParallax3D() {
  const { x, y, enabled } = useMouseParallax()
  return { x, y, enabled }
}

/**
 * A shared response curve for the 3D scene's two pointer
 * consumers (CameraRig, CricketBall). The raw -1..1 values are already
 * spring-smoothed by MouseParallaxProvider, but consumed linearly they made
 * the scene track the cursor everywhere, all the time — reading as "default
 * mouse behavior" rather than an intentional, spatial response. Cubing
 * preserves sign and the -1..1 range but suppresses small values near the
 * center far more than values near the edge (0.1 -> 0.001, 0.8 -> 0.512),
 * so the response is close to neutral around the middle of the Hero and
 * only becomes noticeable once the pointer is deliberately near an edge.
 */
export function easePointer(value) {
  return Math.sign(value) * Math.abs(value) ** 3
}
