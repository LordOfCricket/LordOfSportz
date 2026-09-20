import { motion } from 'motion/react'
import useScrollEnvironment from '../../../hooks/useScrollEnvironment.js'

/**
 * This started as a simple 3-point opacity "breathe" on the
 * Ambient + Glow layers, with its own scroll listener, and has since evolved the
 * curve — not the wrapped layers, and not what this component does — into
 * a section-anchored lighting progression (soft at Gallery, brighter
 * energy at Matches, a warm peak at Booking, calm dark at Footer) sourced
 * from ScrollEnvironmentContext's shared `brightness` MotionValue. See
 * environmentTimeline.js for the actual stop values, and
 * ScrollEnvironmentContext.jsx for why this now reads from a shared
 * provider instead of its own listener.
 */
export default function ScrollAtmosphere({ children, className = '' }) {
  const { brightness, enabled } = useScrollEnvironment()

  if (!enabled) {
    return <div className={className}>{children}</div>
  }

  return (
    <motion.div className={className} style={{ opacity: brightness }}>
      {children}
    </motion.div>
  )
}
