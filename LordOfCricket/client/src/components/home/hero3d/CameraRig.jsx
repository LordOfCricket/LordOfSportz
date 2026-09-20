import { useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { PerspectiveCamera } from '@react-three/drei'
import useHeroParallax3D, { easePointer } from '../../../hooks/useHeroParallax3D.js'

// Deliberately tiny — this is a "living" camera, not an animated one.
const BREATHE_SPEED = 0.15
const BREATHE_AMPLITUDE = 0.05
// Lowered from 0.12 and run through easePointer() below: the
// camera should be the least reactive layer in the scene (CricketBall's own
// tilt reads as slightly more responsive), so parallax here stays close to
// imperceptible near the center of the Hero.
const PARALLAX_AMPLITUDE = 0.07

// Composition only. At the original defaults (fov 38,
// distance 5, looking at the origin) the ball projected to dead-center of
// the Hero canvas — which is where the gallery/score panels sit, so on
// desktop it was reduced to a thin sliver in the ~20px column gutter
// between them. Pulling the camera back, narrowing the FOV, and lowering
// the look-at target reframes the same ball into the empty band above the
// content grid (verified against real measured DOM gaps) without moving
// the grid, the gallery, the panels, or the ball's own world position
// (CricketBall.jsx is unchanged).
const CAMERA_DISTANCE = 13
const CAMERA_FOV = 36
const LOOK_AT_Y = -2.6

// Narrow (phone-width) viewports get a bit more distance so
// the ball reads as a tasteful accent instead of spanning half the screen
// width; LOOK_AT_Y scales with it too, since the vertical framing is
// governed by the look-at *angle* (atan(LOOK_AT_Y / distance)) — scaling
// both by the same factor preserves that angle, so the ball lands in the
// same relative on-screen position, just smaller. Reuses R3F's own
// tracked canvas size (`useThree`) rather than a new resize listener.
const MOBILE_WIDTH_BREAKPOINT = 500
const MOBILE_DISTANCE_FACTOR = 1.3

/**
 * A slow idle "breathe" (sine drift on
 * position) plus a tiny mouse-parallax offset sourced from the
 * existing MouseParallaxProvider via useHeroParallax3D — no new pointer
 * listener. On touch/no-hover/reduced-motion, `enabled` is already false
 * (the same signal used everywhere else), so only the breathe
 * plays; HeroScene doesn't mount at all under reduced motion, so in
 * practice this component only ever runs with breathing at minimum.
 */
export default function CameraRig() {
  const cameraRef = useRef(null)
  const { x, y, enabled } = useHeroParallax3D()
  const { size } = useThree()

  const isNarrow = size.width < MOBILE_WIDTH_BREAKPOINT
  const distance = isNarrow ? CAMERA_DISTANCE * MOBILE_DISTANCE_FACTOR : CAMERA_DISTANCE
  const lookAtY = isNarrow ? LOOK_AT_Y * MOBILE_DISTANCE_FACTOR : LOOK_AT_Y

  useFrame((state) => {
    const camera = cameraRef.current
    if (!camera) return

    const t = state.clock.elapsedTime
    const breatheX = Math.sin(t * BREATHE_SPEED) * BREATHE_AMPLITUDE
    const breatheY = Math.cos(t * BREATHE_SPEED * 0.8) * BREATHE_AMPLITUDE * 0.6

    const parallaxX = enabled ? easePointer(x.get()) * PARALLAX_AMPLITUDE : 0
    const parallaxY = enabled ? -easePointer(y.get()) * PARALLAX_AMPLITUDE : 0

    camera.position.x = breatheX + parallaxX
    camera.position.y = breatheY + parallaxY
    camera.lookAt(0, lookAtY, 0)
  })

  return <PerspectiveCamera ref={cameraRef} makeDefault fov={CAMERA_FOV} position={[0, 0, distance]} />
}
