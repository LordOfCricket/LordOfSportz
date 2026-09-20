import { useSeoMeta } from '../../hooks/useSeoMeta.js'
import { useJsonLd } from '../../hooks/useJsonLd.js'
import HomeNavbar from '../../components/home/v2/HomeNavbar.jsx'
import HomeHero from '../../components/home/v2/HomeHero.jsx'
import WhoWeAreSection from '../../components/home/v2/WhoWeAreSection.jsx'
import FeaturedGroundsSection from '../../components/home/v2/FeaturedGroundsSection.jsx'
import HallOfFameSection from '../../components/home/v2/HallOfFameSection.jsx'
import OurNetworkSection from '../../components/home/v2/OurNetworkSection.jsx'
import MerchandiseSection from '../../components/home/v2/MerchandiseSection.jsx'
import HomeFooter from '../../components/home/v2/HomeFooter.jsx'

export default function DiscoveryPage() {
  useSeoMeta({
    title: 'Lord Of Cricket — Find & Book Cricket Grounds Near You',
    description: 'Discover and book cricket grounds, organize matches, and connect with the cricket ecosystem on Lord Of Cricket.',
    canonical: `${window.location.origin}/`,
  })
  useJsonLd({
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'Lord Of Cricket',
    url: window.location.origin,
  })

  return (
    <div className="loc-page">
      <HomeNavbar />
      <HomeHero />
      <WhoWeAreSection />
      <FeaturedGroundsSection />
      <HallOfFameSection />
      <MerchandiseSection />
      <OurNetworkSection />
      <HomeFooter />
    </div>
  )
}
