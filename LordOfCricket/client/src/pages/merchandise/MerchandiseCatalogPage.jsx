import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { useSeoMeta } from '../../hooks/useSeoMeta.js'
import Navbar from '../../components/home/Navbar.jsx'
import SiteFooter from '../../components/home/SiteFooter.jsx'
import ScrollReveal from '../../components/common/ScrollReveal.jsx'
import MerchandiseCard from '../../components/merchandise/MerchandiseCard.jsx'
import { useMerchandise } from '../../hooks/useMerchandise.js'
import { fadeUpSoft } from '../../lib/revealVariants.js'

function CardSkeleton() {
  return <div className="h-96 animate-pulse rounded-3xl border border-loc-border bg-loc-mint" />
}

// Read-only catalog — the "Explore Merchandise" destination. Same public
// data and card as the homepage section; no cart / filters / checkout.
export default function MerchandiseCatalogPage() {
  const { products, loading, error } = useMerchandise()

  useSeoMeta({
    title: 'LOC Merchandise — Official Cricket Store',
    description: 'Official Lord Of Cricket merchandise — jerseys, tees, caps and accessories for those who live the game.',
    canonical: `${window.location.origin}/merchandise`,
  })

  return (
    <div className="loc-page overflow-x-hidden">
      <Navbar theme="light" />

      <main className="relative mx-auto flex w-full max-w-7xl flex-col gap-10 px-6 pt-28 pb-20 lg:px-10">
        <ScrollReveal variant={fadeUpSoft} amount={0.4} className="flex flex-col gap-3">
          <Link to="/" className="inline-flex items-center gap-1.5 text-sm font-semibold text-loc-muted transition-colors hover:text-loc-navy">
            <ArrowLeft className="h-4 w-4" />
            Back to Home
          </Link>
          <span className="loc-eyebrow">LOC Store</span>
          <h1 className="loc-heading font-loc-display text-4xl tracking-[0.04em] sm:text-5xl">
            Wear the Spirit of Cricket.
          </h1>
          <p className="max-w-xl text-loc-muted">Official LOC merchandise for those who live the game.</p>
        </ScrollReveal>

        {error ? (
          <p className="text-red-600">{error}</p>
        ) : loading ? (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <CardSkeleton key={i} />
            ))}
          </div>
        ) : products.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-3xl border border-dashed border-loc-border bg-loc-mint px-8 py-16 text-center">
            <p className="text-sm text-loc-faint">No merchandise available yet — check back soon.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {products.map((product) => (
              <MerchandiseCard key={product.id} product={product} />
            ))}
          </div>
        )}
      </main>

      <SiteFooter theme="light" />
    </div>
  )
}
