import { motion, useTransform } from 'motion/react'
import useMouseParallax from '../../hooks/useMouseParallax.js'

/**
 * One shared depth wrapper — used both for BackgroundSystem's layers
 * (translate only, a handful of px) and Hero's content panels (translate +
 * optional tiny rotateX/rotateY "perspective" tilt). The caller's
 * `className` fully controls sizing/positioning, so this fits both a
 * `fixed inset-0` background context and a normal-flow Hero panel without
 * needing two separate components.
 */
export default function ParallaxLayer({
  children,
  strength = 6,
  tilt = false,
  tiltStrength = 3,
  className = '',
}) {
  const { x, y, enabled } = useMouseParallax()
  const translateX = useTransform(x, [-1, 1], [-strength, strength])
  const translateY = useTransform(y, [-1, 1], [-strength, strength])
  const rotateX = useTransform(y, [-1, 1], [tiltStrength, -tiltStrength])
  const rotateY = useTransform(x, [-1, 1], [-tiltStrength, tiltStrength])

  if (!enabled) {
    return <div className={className}>{children}</div>
  }

  return (
    <motion.div
      className={className}
      style={{
        x: translateX,
        y: translateY,
        ...(tilt ? { rotateX, rotateY, transformPerspective: 800 } : {}),
      }}
    >
      {children}
    </motion.div>
  )
}
