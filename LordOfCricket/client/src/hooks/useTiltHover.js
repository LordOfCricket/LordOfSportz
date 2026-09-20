import { useMotionValue, useSpring } from 'motion/react'
import usePointerCapability from './usePointerCapability.js'

// Extracted from GroundGallery.jsx's original `useGalleryTilt` (unchanged
// behavior/defaults) so the same pointer-driven perspective-tilt pattern is
// reusable elsewhere (FeaturedGrounds' editorial cards) instead of being
// re-implemented. Deliberately local per call site, not routed through the
// shared Hero mouse-parallax context — this needs bounds/resolution scoped
// to the element itself (hover-to-inspect), not the whole viewport.
export default function useTiltHover(maxTiltDeg = 5, maxScale = 1.015) {
  const enabled = usePointerCapability()
  const rotateX = useMotionValue(0)
  const rotateY = useMotionValue(0)
  const scale = useMotionValue(1)
  const spring = { stiffness: 200, damping: 20, mass: 0.4 }
  const springRotateX = useSpring(rotateX, spring)
  const springRotateY = useSpring(rotateY, spring)
  const springScale = useSpring(scale, spring)

  const onPointerMove = (event) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const px = (event.clientX - rect.left) / rect.width
    const py = (event.clientY - rect.top) / rect.height
    rotateY.set((px - 0.5) * 2 * maxTiltDeg)
    rotateX.set((0.5 - py) * 2 * maxTiltDeg)
    scale.set(maxScale)
  }
  const onPointerLeave = () => {
    rotateX.set(0)
    rotateY.set(0)
    scale.set(1)
  }

  return {
    enabled,
    style: { rotateX: springRotateX, rotateY: springRotateY, scale: springScale, transformPerspective: 800 },
    onPointerMove,
    onPointerLeave,
  }
}
