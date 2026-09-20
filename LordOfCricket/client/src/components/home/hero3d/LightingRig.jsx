import { THREE_LIGHT_TOKENS } from '../../../lib/threeLightingTokens.js'

/**
 * Foundation lighting only: key/fill/rim/ambient, positioned
 * and colored to match the existing CSS floodlight system (FloodLightRays'
 * left/right cool-white beams, AmbientLighting's gold halo, GlowLayer's
 * grass orb) so the 3D scene and the DOM background read as one lighting
 * environment rather than two unrelated ones. No HDRI, no shadow maps, no
 * post-processing — explicitly out of scope for now.
 *
 * Retuned toward a darker, higher-contrast "night stadium"
 * balance: one light (key) is now clearly dominant instead of key/fill
 * sitting close together, and ambient/hemisphere is pulled down so the
 * environment itself reads darker and the ball's shadow side actually goes
 * toward shadow rather than staying evenly lit. Same four lights, same
 * positions/colors relative to the existing CSS floodlight system — only
 * intensities (and the rim's position, tightened behind the ball) changed.
 */
export default function LightingRig() {
  return (
    <>
      {/* Key — mirrors FloodLightRays' upper-left cool-white beam; now the
          clearly dominant light so the leather highlight reads as one
          controlled source instead of a flat multi-light wash. */}
      <directionalLight color={THREE_LIGHT_TOKENS.keyCool} intensity={1.9} position={[-3.4, 2.6, 4.8]} />
      {/* Fill — mirrors FloodLightRays' upper-right beam + AmbientLighting's
          gold halo; pulled way down so it only keeps the shadow side of the
          leather readable instead of competing with the key highlight. */}
      <directionalLight color={THREE_LIGHT_TOKENS.fillGold} intensity={0.22} position={[3, 1.2, 2.6]} />
      {/* Rim — mirrors GlowLayer's grass-colored orb; repositioned tighter
          behind/above the ball and boosted so it separates the leather from
          the dark backdrop without tinting the ball's own color. */}
      <pointLight color={THREE_LIGHT_TOKENS.rimGrass} intensity={0.85} position={[0.6, 0.9, -3.4]} />
      {/* Ambient — lowered so the environment itself stays dark/cinematic;
          only enough left to keep the shadow side out of pure black. */}
      <hemisphereLight
        color={THREE_LIGHT_TOKENS.ambientSky}
        groundColor={THREE_LIGHT_TOKENS.ambientGround}
        intensity={0.22}
      />
    </>
  )
}
