/**
 * Mirrors the CSS palette already established in index.css
 * (--color-loc-*) and the DOM background layers (FloodLightRays' cool
 * white/blue floodlight core, AmbientLighting's gold halo, GlowLayer's
 * grass/gold/night-blue/white orbs) so the 3D lighting rig and the
 * existing atmospheric background read as ONE lighting environment
 * instead of two unrelated systems. Plain hex strings — THREE.Color
 * accepts them directly, no conversion needed.
 */
export const THREE_LIGHT_TOKENS = {
  // Key light — echoes FloodLightRays' `--left` cool white/blue beam core.
  keyCool: '#bfe3ff',
  // Fill light — --color-loc-gold, echoes FloodLightRays' `--right` beam
  // and AmbientLighting's gold halo.
  fillGold: '#c6a15b',
  // Rim light — --color-loc-grass, echoes GlowLayer's grass orb.
  rimGrass: '#3f8f5f',
  // Ambient hemisphere — warm-white "sky" tone (--color-loc-warmwhite)
  // over a dark "ground" tone (--color-loc-dark), so the shadow side of
  // any object never goes pure black, matching the CSS system's layered
  // (never harsh single-source) approach to ambient fill.
  ambientSky: '#f3f1e7',
  ambientGround: '#0e1210',
}
