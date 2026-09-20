import { motion, useReducedMotion } from 'motion/react'
import useCountUp from '../../hooks/useCountUp.js'
import { staggerItemUp } from '../../lib/revealVariants.js'

const CARD_CLASSNAME =
  'w-40 rounded-2xl border border-emerald-400/15 bg-linear-to-b from-white/6 to-transparent px-4 py-6 text-center shadow-lg shadow-black/20 transition-all duration-300 hover:-translate-y-1 hover:border-emerald-400/40'

// About section stat. Same DOM node drives both the count-up
// trigger (useCountUp's `ref` = in-view detector) and the stagger-reveal
// (motion.div `variants`, inherited from the parent ScrollReveal's
// staggerContainer state) — see useCountUp.js / revealVariants.js.
export default function StatCounter({ stat }) {
  const reduceMotion = useReducedMotion()
  const { ref, text } = useCountUp(stat.value)

  if (reduceMotion) {
    return (
      <div ref={ref} className={CARD_CLASSNAME}>
        <p className="bg-linear-to-r from-emerald-300 to-emerald-500 bg-clip-text text-3xl font-bold text-transparent">
          {text}
        </p>
        <p className="mt-1 text-sm text-emerald-100/60">{stat.label}</p>
      </div>
    )
  }

  return (
    <motion.div ref={ref} variants={staggerItemUp} className={CARD_CLASSNAME}>
      <p className="bg-linear-to-r from-emerald-300 to-emerald-500 bg-clip-text text-3xl font-bold text-transparent">
        {text}
      </p>
      <p className="mt-1 text-sm text-emerald-100/60">{stat.label}</p>
    </motion.div>
  )
}
