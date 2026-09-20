import { motion, useReducedMotion } from 'motion/react'
import { fadeUp } from '../../lib/revealVariants.js'

/**
 * Shared scroll-reveal wrapper. One IntersectionObserver
 * (framer-motion's `whileInView`) per instance; each call site passes its
 * own `variant` from revealVariants.js so no two sections move identically.
 * `once` defaults true — this is a one-time entrance, not a scroll-repeat
 * effect (repeating on every scroll up/down reads as flashing, not
 * cinematic).
 *
 * Reduced-motion users get the plain, unanimated element — same convention
 * Hero's own entrance already uses (`reduceMotion ? {} : reveal(delay)`),
 * just expressed as a static fallback element instead of empty motion
 * props, since this wrapper doesn't otherwise need to render a motion node
 * at all in that case.
 */
export default function ScrollReveal({
  children,
  as = 'div',
  variant = fadeUp,
  amount = 0.25,
  once = true,
  className = '',
  ...rest
}) {
  const reduceMotion = useReducedMotion()

  if (reduceMotion) {
    const Static = as
    return (
      <Static className={className} {...rest}>
        {children}
      </Static>
    )
  }

  const Component = motion[as]

  return (
    <Component
      className={className}
      variants={variant}
      initial="hidden"
      whileInView="visible"
      viewport={{ once, amount }}
      {...rest}
    >
      {children}
    </Component>
  )
}
