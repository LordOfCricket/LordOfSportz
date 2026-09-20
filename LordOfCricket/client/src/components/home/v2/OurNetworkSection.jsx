import { useEffect, useState } from 'react'
import { getPartners } from '../../../services/partners.js'

export default function OurNetworkSection() {
  const [partners, setPartners] = useState(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    getPartners()
      .then((data) => {
        if (!cancelled) setPartners(data)
      })
      .catch(() => {
        if (!cancelled) setError(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (error) return null
  const loading = partners === null

  return (
    <section className="w-full bg-loc-surface px-6 py-16 sm:px-10 lg:px-16 lg:py-20">
      <div className="mx-auto flex w-full max-w-[1400px] flex-col items-center gap-8 text-center">
        <div className="w-full">
          <h2 className="text-3xl font-black uppercase leading-tight text-loc-navy sm:text-4xl lg:whitespace-nowrap">
            Powered By Those Who Believe In The Game.
          </h2>
        </div>

        {loading ? (
          <div className="h-16 w-full max-w-md animate-pulse rounded-2xl bg-slate-100" />
        ) : partners.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-loc-border bg-loc-mint px-8 py-8 text-sm text-loc-muted">
            LOC is just getting started — partner logos will appear here soon.
          </p>
        ) : (
          <div className="flex w-full max-w-5xl flex-wrap items-center justify-center gap-8">
            {partners.map((partner) => {
              const Wrapper = partner.website_url ? 'a' : 'div'
              return (
                <div key={partner.id} className="flex w-36 flex-col items-center gap-2">
                  <Wrapper
                    {...(partner.website_url ? { href: partner.website_url, target: '_blank', rel: 'noreferrer' } : {})}
                    className="flex h-16 w-32 items-center justify-center grayscale transition hover:grayscale-0"
                  >
                    <img src={partner.logo_url} alt={partner.name} className="max-h-full max-w-full object-contain" />
                  </Wrapper>
                  <p className="text-sm font-semibold text-loc-ink">{partner.name}</p>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </section>
  )
}
