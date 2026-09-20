import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Vector3 } from 'three'
import useHeroParallax3D, { easePointer } from '../../../hooks/useHeroParallax3D.js'
import { createCricketBallSurfaceTexture } from './cricketBallTexture.js'

// Slow and deliberate — premium product cinematography, not a spinner.
const ROTATION_SPEED = 0.15
const FLOAT_SPEED = 0.12
const FLOAT_AMPLITUDE = 0.04
// A tiny depth (z-axis) drift, independent of the vertical float:
// a different speed and a cosine instead of a sine so the two never share a
// phase (they'd cross zero together every cycle otherwise, which reads as
// one motion pretending to be two). Amplitude stays small relative to the
// camera's 13-unit distance — this is a "suspended in space" cue, not a
// bob toward/away from camera.
const DEPTH_SPEED = 0.09
const DEPTH_AMPLITUDE = 0.025
// The ball now reads as *slightly* more responsive than
// CameraRig's parallax (0.07), not less: two layers moving at visibly
// different rates (and both run through easePointer, see below) is what
// sells depth, rather than a single amplitude relationship repeated twice.
const TILT_AMPLITUDE = 0.1

// A deep, slightly desaturated match-ball red — not a bright/saturated
// "brand red," a real leather ball's color under stadium light.
const LEATHER_COLOR = '#7d1f1f'

// A fixed rest orientation for the seam, applied once via the
// parent group below rather than baked into the texture. A real ball never
// settles perfectly "seam-to-camera" or "seam-level"; tilting the whole
// seam band off both the view axis and the spin axis is what stops it
// reading as a flat circular ring painted on a sphere.
const SEAM_TILT = [0.46, 0.18, -0.3]

// Continuous rotation turns around this fixed but
// deliberately off-Y axis instead of mesh.rotation.y alone. A pure-Y spin
// keeps presenting the equatorial seam at the same apparent latitude every
// revolution, which is what read as "revolving around an axis" rather than
// a physical object tumbling in space. rotateOnAxis() rotates around this
// axis in the mesh's own local space each frame, so it stays one smooth,
// continuous, non-random motion — just no longer aligned to world-up.
const ROTATION_AXIS = new Vector3(0.22, 0.92, 0.14).normalize()

/**
 * Replaces PlaceholderSphere as HeroScene's third child, same
 * component boundary (HeroScene.jsx is otherwise untouched). Same base
 * geometry already validated, now with a leather MeshPhysicalMaterial and
 * the procedural seam/grain texture from cricketBallTexture.js.
 *
 * Restructured into the group hierarchy the visual review asked
 * for: an outer `floatGroup` owns float + depth drift + pointer tilt (the
 * motions that should move the ball as a whole), an inner static group
 * applies SEAM_TILT once (orientation), and the innermost mesh owns only
 * the continuous off-axis spin. Splitting these means the seam's resting
 * angle, its tumble, and the ball's float/tilt are independent motions
 * instead of one rotation.y doing all the work.
 *
 * Float (y), depth drift (z, see DEPTH_SPEED/DEPTH_AMPLITUDE
 * above) and pointer tilt each run on their own speed/phase, so the ball
 * never collapses into "one sine wave wearing three hats."
 *
 * Pointer tilt is still sourced from the existing MouseParallaxProvider
 * via useHeroParallax3D — the same bridge CameraRig uses, not a new
 * listener — now run through the shared easePointer() curve so the ball
 * stays near-neutral when the pointer is near the center of the Hero.
 */
export default function CricketBall() {
  const floatGroupRef = useRef(null)
  const spinRef = useRef(null)
  const { x, y, enabled } = useHeroParallax3D()
  const surfaceTexture = useMemo(() => createCricketBallSurfaceTexture(), [])

  useFrame((state, delta) => {
    const floatGroup = floatGroupRef.current
    const spin = spinRef.current
    if (!floatGroup || !spin) return

    spin.rotateOnAxis(ROTATION_AXIS, ROTATION_SPEED * delta)

    const t = state.clock.elapsedTime
    floatGroup.position.y = Math.sin(t * FLOAT_SPEED) * FLOAT_AMPLITUDE
    floatGroup.position.z = Math.cos(t * DEPTH_SPEED) * DEPTH_AMPLITUDE

    floatGroup.rotation.x = enabled ? -easePointer(y.get()) * TILT_AMPLITUDE : 0
    floatGroup.rotation.z = enabled ? easePointer(x.get()) * TILT_AMPLITUDE : 0
  })

  return (
    <group ref={floatGroupRef}>
      <group rotation={SEAM_TILT}>
        <mesh ref={spinRef}>
          <sphereGeometry args={[1, 64, 64]} />
          <meshPhysicalMaterial
            color={LEATHER_COLOR}
            roughness={0.46}
            roughnessMap={surfaceTexture}
            bumpMap={surfaceTexture}
            bumpScale={0.06}
            metalness={0}
            clearcoat={0.16}
            clearcoatRoughness={0.3}
          />
        </mesh>
      </group>
    </group>
  )
}
