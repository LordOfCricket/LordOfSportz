/**
 * NEW — two soft stadium floodlight beams, angled down from where light
 * towers would sit above the grandstand roofline (top-left / top-right),
 * converging toward the ground. Each beam is a `clip-path` cone (narrow at
 * the light source, wide at the ground) rather than a plain rectangle, so
 * it actually reads as a light cone — then blurred hard enough that the
 * cone's straight edges dissolve into a soft, diffused glow instead of a
 * visible geometric shape. Cool white/blue core (real floodlights, unlike
 * the site's warm gold accent elsewhere) — see index.css `.loc-bg-flood-ray`
 * for the exact gradient. The second beam is desktop/tablet-only; one beam
 * reads plenty on a phone-width viewport.
 */
export default function FloodLightRays() {
  return (
    <>
      <div className="loc-bg-flood-ray loc-bg-flood-ray--left absolute -top-[15%] -left-[10%] h-[85vh] w-[55vw] blur-2xl" />
      <div className="loc-bg-flood-ray loc-bg-flood-ray--right absolute -top-[15%] -right-[10%] hidden h-[85vh] w-[55vw] blur-2xl sm:block" />
    </>
  )
}
