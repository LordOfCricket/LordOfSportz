import { useCallback, useRef } from 'react'
import usePointerCapability from './usePointerCapability.js'

// Ref-based, direct DOM style mutation — no React state, no MotionValue
// subscription. This is a pure cosmetic paint effect (a radial-gradient
// position), not a physics animation, so there's no reason to pay for a
// re-render or a spring on every pointer move.
export default function useGlowHover() {
  const enabled = usePointerCapability()
  const ref = useRef(null)

  const onPointerMove = useCallback((event) => {
    if (!ref.current) return
    const rect = ref.current.getBoundingClientRect()
    ref.current.style.setProperty('--loc-glow-x', `${((event.clientX - rect.left) / rect.width) * 100}%`)
    ref.current.style.setProperty('--loc-glow-y', `${((event.clientY - rect.top) / rect.height) * 100}%`)
    ref.current.style.setProperty('--loc-glow-opacity', '1')
  }, [])

  const onPointerLeave = useCallback(() => {
    ref.current?.style.setProperty('--loc-glow-opacity', '0')
  }, [])

  return { enabled, ref, onPointerMove, onPointerLeave }
}
