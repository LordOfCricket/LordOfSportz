import { useEffect, useState } from 'react'
import { useReducedMotion } from 'motion/react'

// Fine pointer + real hover support is naturally false on touch devices —
// no separate touch-detection needed. This is the single gate every
// mouse-interaction hook checks before attaching any listener at all, so
// mobile/touch/reduced-motion users pay zero extra JS cost and keep the
// existing plain-CSS hover states exactly as they were.
const QUERY = '(pointer: fine) and (hover: hover)'

function readCanHover() {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia(QUERY).matches
}

export default function usePointerCapability() {
  const reduceMotion = useReducedMotion()
  const [canHover, setCanHover] = useState(readCanHover)

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined
    const mql = window.matchMedia(QUERY)
    const onChange = () => setCanHover(mql.matches)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])

  return canHover && !reduceMotion
}
