import { useEffect, useRef, useState } from 'react'
import { animate, useInView, useReducedMotion } from 'motion/react'

// Stats are display strings like "15+" / "500+" / "6" — split the leading
// integer (what gets animated) from whatever trails it (kept as-is, e.g. "+").
function parseStat(value) {
  const match = /^(\d+)(.*)$/.exec(String(value))
  if (!match) return { target: null, suffix: '' }
  return { target: Number(match[1]), suffix: match[2] }
}

/**
 * About section stat count-up. Counts from 0 to the stat's target
 * once it scrolls into view, once per page load. Non-numeric or reduced-
 * motion cases skip straight to the final text (no partial/garbled count).
 */
export default function useCountUp(value, { duration = 1.2 } = {}) {
  const { target, suffix } = parseStat(value)
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, amount: 0.5 })
  const reduceMotion = useReducedMotion()
  const [display, setDisplay] = useState(target === null || reduceMotion ? target : 0)

  useEffect(() => {
    if (target === null || reduceMotion || !inView) return undefined
    const controls = animate(0, target, {
      duration,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => setDisplay(Math.round(v)),
    })
    return () => controls.stop()
  }, [inView, target, duration, reduceMotion])

  return { ref, text: target === null ? String(value) : `${display}${suffix}` }
}
