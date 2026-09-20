import { motion } from 'motion/react'
import useScrollEnvironment from '../../../hooks/useScrollEnvironment.js'

/**
 * The environmental "color grading" pass: one soft-light-blended
 * overlay whose color drifts through the section-anchored palette in
 * environmentTimeline.js (cool morning at Hero → energetic green at
 * Matches → warm gold at Booking → calm dark at Footer) as the visitor
 * scrolls. Rendered last in BackgroundSystem (on top of every other
 * layer, including FloatingParticles) so it grades the whole composed
 * scene rather than tinting one layer underneath the others.
 *
 * `mix-blend-mode: soft-light` + the timeline's low alpha values keep this
 * a mood shift, never a wash over content — Gradient/Fog/FloodLightRays/
 * AmbientLighting/GlowLayer/FloatingParticles are all unmodified by this.
 *
 * No reduced-motion fallback element: the pre-Phase-6 background (this
 * layer simply absent) was already the tuned, verified atmosphere, so
 * "static presentation" here means not rendering this layer at all rather
 * than freezing it at some arbitrary stop.
 */
export default function EnvironmentTint({ className = '' }) {
  const { tint, enabled } = useScrollEnvironment()

  if (!enabled) return null

  return <motion.div className={className} style={{ background: tint, mixBlendMode: 'soft-light' }} />
}
