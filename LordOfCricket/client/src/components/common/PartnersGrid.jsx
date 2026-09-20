import { useEffect, useState } from 'react'
import { getPartners } from '../../services/partners.js'
import useGlowHover from '../../hooks/useGlowHover.js'
import GlowOverlay from './GlowOverlay.jsx'
import ScrollReveal from './ScrollReveal.jsx'
import StaggerItem from './StaggerItem.jsx'
import { staggerContainer, staggerItemScale } from '../../lib/revealVariants.js'

function PartnerCard({ partner }) {
  const { enabled: glowEnabled, ref: glowRef, onPointerMove: onGlowMove, onPointerLeave: onGlowLeave } = useGlowHover()
  const Wrapper = partner.website_url ? 'a' : 'div'

  return (
    <Wrapper
      {...(partner.website_url
        ? { href: partner.website_url, target: '_blank', rel: 'noreferrer' }
        : {})}
      className="flex w-32 flex-col items-center gap-3 sm:w-36"
    >
      <div
        ref={glowRef}
        {...(glowEnabled ? { onPointerMove: onGlowMove, onPointerLeave: onGlowLeave } : {})}
        className="relative flex h-24 w-24 items-center justify-center overflow-hidden rounded-2xl border border-emerald-400/15 bg-white/5 shadow-lg shadow-black/30 transition-all duration-300 hover:-translate-y-1 hover:scale-105 hover:border-emerald-400/50 hover:shadow-emerald-500/20 sm:h-28 sm:w-28"
      >
        <img
          src={partner.logo_url}
          alt={partner.name}
          className="h-full w-full object-contain p-3"
        />
        {glowEnabled && <GlowOverlay />}
      </div>
      <span className="text-center text-sm font-medium text-emerald-50">
        {partner.name}
      </span>
    </Wrapper>
  )
}

export default function PartnersGrid() {
  const [partners, setPartners] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getPartners()
      .then((data) => setPartners(data))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return <p className="text-emerald-100/60">Loading partners…</p>
  }

  if (partners.length === 0) {
    return <p className="text-emerald-100/60">No partners added yet</p>
  }

  return (
    <ScrollReveal
      variant={staggerContainer(0.1)}
      amount={0.15}
      className="flex w-full flex-wrap justify-center gap-8 px-6 lg:gap-10 lg:px-10"
    >
      {partners.map((partner) => (
        <StaggerItem key={partner.id} variant={staggerItemScale}>
          <PartnerCard partner={partner} />
        </StaggerItem>
      ))}
    </ScrollReveal>
  )
}
