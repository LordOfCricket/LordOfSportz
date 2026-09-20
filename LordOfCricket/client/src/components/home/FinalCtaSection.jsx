import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import ScrollReveal from '../common/ScrollReveal.jsx'
import { spotlightReveal } from '../../lib/revealVariants.js'

// Cinematic close — a single highlighted CTA to the Ground Registration
// entry page (RegisterGroundEntryPage: New Registration vs Check Status —
// no auth wall here; only actually starting a new registration requires
// login).
export default function FinalCtaSection() {
  return (
    <div className="relative w-full overflow-hidden px-6 py-24">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div
          className="absolute inset-0"
          style={{
            background: [
              'radial-gradient(ellipse 60% 60% at 50% 40%, rgba(63,143,95,0.18), transparent 65%)',
              'linear-gradient(180deg, #0a0d0b 0%, #0e1210 50%, #10201a 100%)',
            ].join(','),
          }}
        />
        <div
          className="absolute inset-0 opacity-60"
          style={{ background: 'radial-gradient(ellipse 40% 30% at 50% 30%, color-mix(in srgb, var(--color-loc-gold) 15%, transparent), transparent 70%)' }}
        />
      </div>

      <ScrollReveal variant={spotlightReveal} amount={0.4} className="relative mx-auto flex max-w-2xl flex-col items-center text-center">
        <Link
          to="/register-ground"
          className="group inline-flex items-center gap-2.5 rounded-full bg-loc-gold px-8 py-4 font-loc-display text-base font-bold tracking-[0.03em] text-loc-dark uppercase shadow-lg shadow-black/30 transition-colors duration-200 hover:bg-loc-warmwhite sm:text-lg"
        >
          Click Here to Register Your Ground Here
          <ArrowRight className="h-5 w-5 transition-transform duration-200 group-hover:translate-x-1" />
        </Link>
      </ScrollReveal>
    </div>
  )
}
