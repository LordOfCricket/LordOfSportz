import { useMotionValue, useSpring } from 'motion/react'
import usePointerCapability from './usePointerCapability.js'

const SPRING = { stiffness: 300, damping: 20, mass: 0.5 }
const MAX_OFFSET = 8

// Self-contained — its own listener, scoped to whatever single element it's
// attached to (only active while the pointer is actually over that
// element), not routed through the shared Hero parallax context.
export default function useMagneticHover() {
  const enabled = usePointerCapability()
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const springX = useSpring(x, SPRING)
  const springY = useSpring(y, SPRING)

  const onPointerMove = (event) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const relX = event.clientX - (rect.left + rect.width / 2)
    const relY = event.clientY - (rect.top + rect.height / 2)
    x.set(Math.max(-MAX_OFFSET, Math.min(MAX_OFFSET, relX * 0.3)))
    y.set(Math.max(-MAX_OFFSET, Math.min(MAX_OFFSET, relY * 0.3)))
  }

  const onPointerLeave = () => {
    x.set(0)
    y.set(0)
  }

  return { enabled, style: { x: springX, y: springY }, onPointerMove, onPointerLeave }
}
