import { useEffect, useState } from 'react'
import { getAdvertisements } from '../../services/advertisements.js'

export default function AdvertisementsGrid() {
  const [ads, setAds] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getAdvertisements()
      .then((data) => setAds(data))
      .finally(() => setLoading(false))
  }, [])

  if (loading || ads.length === 0) return null

  return (
    <div className="flex w-full flex-wrap justify-center gap-8 px-6 lg:gap-10 lg:px-10">
      {ads.map((ad) => {
        const Wrapper = ad.link_url ? 'a' : 'div'
        return (
          <Wrapper
            key={ad.id}
            {...(ad.link_url ? { href: ad.link_url, target: '_blank', rel: 'noreferrer' } : {})}
            className="group w-full max-w-sm overflow-hidden rounded-2xl border border-emerald-400/15 shadow-lg shadow-black/30 transition-all duration-300 hover:-translate-y-1 hover:scale-105 hover:border-emerald-400/50 hover:shadow-emerald-500/20"
          >
            <img
              src={ad.image_url}
              alt={ad.title || 'Advertisement'}
              className="h-48 w-full object-cover"
            />
          </Wrapper>
        )
      })}
    </div>
  )
}
