import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { Handshake } from 'lucide-react'
import { getPartners } from '../../services/partners.js'
import ScrollReveal from '../common/ScrollReveal.jsx'
import { fadeUpSoft, staggerContainer, staggerItemScale } from '../../lib/revealVariants.js'

// "POWERED BY THOSE WHO BELIEVE IN THE GAME." — real GET /api/partners data
// only. There are zero real partners today; per the brief's explicit
// instruction this ships wired to the real API with an honest "not yet"
// state, never invented company names/logos.
export default function SponsorsSection() {
  const [partners, setPartners] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    getPartners()
      .then((data) => {
        if (!cancelled) setPartners(data)
      })
      .catch((err) => {
        if (!cancelled) setError(err.response?.data?.error || "Couldn't load partners.")
      })
    return () => {
      cancelled = true
    }
  }, [])

  const loading = partners === null && error === null

  return (
    <div className="flex w-full flex-col items-center gap-10 px-6 py-6">
      <ScrollReveal variant={fadeUpSoft} amount={0.4} className="flex max-w-2xl flex-col items-center gap-3 text-center">
        <span className="text-sm font-semibold uppercase tracking-widest text-emerald-400">Our Network</span>
        <h2 className="font-loc-display text-3xl font-extrabold tracking-[0.04em] text-loc-gold uppercase sm:text-4xl">
          Powered By Those Who Believe In The Game.
        </h2>
      </ScrollReveal>

      {loading && <div className="h-16 w-full max-w-md animate-pulse rounded-2xl bg-white/5" />}

      {!loading && error && <p className="text-red-300/80">{error}</p>}

      {!loading && !error && partners.length === 0 && (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-emerald-400/20 bg-white/2 px-8 py-8 text-center">
          <Handshake className="h-6 w-6 text-emerald-400/40" aria-hidden="true" />
          <p className="text-sm text-emerald-100/50">LOC is just getting started — partner logos will appear here soon.</p>
        </div>
      )}

      {!loading && !error && partners.length > 0 && (
        <ScrollReveal
          as="div"
          variant={staggerContainer(0.06)}
          amount={0.2}
          className="flex w-full max-w-5xl flex-wrap items-start justify-center gap-8"
        >
          {partners.map((partner) => {
            const Wrapper = partner.website_url ? 'a' : 'div'
            return (
              <motion.div key={partner.id} variants={staggerItemScale} className="flex w-36 flex-col items-center gap-2 text-center">
                <Wrapper
                  {...(partner.website_url ? { href: partner.website_url, target: '_blank', rel: 'noreferrer' } : {})}
                  className="flex h-16 w-32 items-center justify-center opacity-70 grayscale transition-all duration-300 hover:opacity-100 hover:grayscale-0"
                >
                  <img src={partner.logo_url} alt={partner.name} className="max-h-full max-w-full object-contain" />
                </Wrapper>
                <p className="text-sm font-semibold text-emerald-50">{partner.name}</p>
                {partner.description && <p className="text-xs text-emerald-100/50">{partner.description}</p>}
              </motion.div>
            )
          })}
        </ScrollReveal>
      )}
    </div>
  )
}
