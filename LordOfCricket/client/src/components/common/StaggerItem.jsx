import { motion, useReducedMotion } from 'motion/react'
import { staggerItemUp } from '../../lib/revealVariants.js'

/**
 * A stagger-group child — pairs with a parent ScrollReveal using a
 * `staggerContainer` variant. It has no viewport trigger of its own; it
 * inherits the parent's "hidden"/"visible" state through framer-motion's
 * variant propagation (matching variant keys, no own `initial`/`animate`).
 *
 * Checks `useReducedMotion()` itself (rather than trusting the parent's
 * branch) so parent and child always agree on plain-vs-motion — a mismatch
 * would leave this as an un-driven motion node with no ancestor state to
 * inherit.
 */
export default function StaggerItem({ children, as = 'div', variant = staggerItemUp, className = '' }) {
  const reduceMotion = useReducedMotion()

  if (reduceMotion) {
    const Static = as
    return <Static className={className}>{children}</Static>
  }

  const Component = motion[as]

  return (
    <Component className={className} variants={variant}>
      {children}
    </Component>
  )
}
