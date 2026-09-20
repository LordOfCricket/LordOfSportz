/**
 * NEW — reusable atmospheric fog. Three large, softly blurred, neutral
 * cool-grey drifts (deliberately NOT tinted grass/gold — fog reads as
 * atmosphere/depth, not another colored glow) that drift horizontally at
 * three different speeds/opacities so they never line up and read as one
 * flat layer. Sits between the base gradient and the floodlight rays, so
 * the rays read as if cutting through it.
 *
 * `.loc-bg-fog` (index.css) carries its own static position/opacity/blur
 * outside the keyframe — same discipline as the rest of this system — so
 * `prefers-reduced-motion` just removes the drift and leaves a still,
 * still-atmospheric layer, never an empty one.
 */
export default function FogLayer() {
  return (
    <>
      <div className="loc-bg-fog loc-bg-fog--1 absolute top-[10%] -left-1/4 h-[55vh] w-[85vw] rounded-full blur-2xl" />
      <div className="loc-bg-fog loc-bg-fog--2 absolute top-[45%] -right-1/4 h-[50vh] w-[80vw] rounded-full blur-2xl" />
      {/* Desktop/tablet only — mobile keeps the two above, same "fewer/
          lighter on mobile" approach FloatingParticles already uses. */}
      <div className="loc-bg-fog loc-bg-fog--3 absolute bottom-0 left-1/3 hidden h-[45vh] w-[70vw] rounded-full blur-2xl sm:block" />
    </>
  )
}
