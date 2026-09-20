import { Link } from 'react-router-dom'
import { motion } from 'motion/react'
import { ArrowRight, ShoppingBag } from 'lucide-react'
import { useMerchandise } from '../../hooks/useMerchandise.js'
import MerchandiseCard from '../merchandise/MerchandiseCard.jsx'
import ScrollReveal from '../common/ScrollReveal.jsx'
import { fadeUpSoft, staggerContainer, staggerItemScale } from '../../lib/revealVariants.js'

function CardSkeleton() {
  return <div className="h-96 animate-pulse rounded-3xl border border-emerald-400/10 bg-white/5" />
}

// "WEAR THE SPIRIT OF CRICKET." — database-driven showcase of the products
// a Super Admin has published (GET /api/merchandise). Same section grammar
// as HallOfFameSection / NextGenerationSection: eyebrow + gold display
// heading + supporting line, a 4-up card grid, honest loading / empty /
// error states. Not a store — every CTA is a link to a read-only detail
// page; cart/checkout is deliberately out of scope.
export default function MerchandiseSection() {
  const { products, loading, error } = useMerchandise()

  // If merchandise fails to load, hide the section entirely rather than
  // showing a broken band on the homepage — the rest of the page is
  // unaffected (same call the homepage already makes for an empty
  // Next Generation).
  if (error) return null

  const isEmpty = !loading && products?.length === 0
  const shown = loading || isEmpty ? [] : products.slice(0, 8)

  return (
    <div className="flex w-full flex-col items-center gap-10 px-6 py-6">
      <ScrollReveal variant={fadeUpSoft} amount={0.4} className="flex max-w-2xl flex-col items-center gap-3 text-center">
        <span className="text-sm font-semibold tracking-widest text-emerald-400 uppercase">LOC Store</span>
        <h2 className="font-loc-display text-4xl font-extrabold tracking-[0.04em] text-loc-gold uppercase sm:text-5xl">
          Wear the Spirit of Cricket.
        </h2>
        <p className="max-w-xl text-emerald-100/60">Official LOC merchandise for those who live the game.</p>
      </ScrollReveal>

      {isEmpty ? (
        <div className="flex flex-col items-center gap-2 rounded-3xl border border-dashed border-emerald-400/20 bg-white/2 px-8 py-10 text-center">
          <ShoppingBag className="h-6 w-6 text-emerald-400/40" aria-hidden="true" />
          <p className="text-sm text-emerald-100/50">The LOC store is stocking up — official merchandise drops here soon.</p>
        </div>
      ) : (
        <ScrollReveal
          as="div"
          variant={staggerContainer(0.1)}
          amount={0.2}
          className="grid w-full max-w-7xl grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4"
        >
          {loading
            ? Array.from({ length: 4 }).map((_, i) => <CardSkeleton key={i} />)
            : shown.map((product) => (
                <motion.div key={product.id} variants={staggerItemScale} className="h-full">
                  <MerchandiseCard product={product} />
                </motion.div>
              ))}
        </ScrollReveal>
      )}

      {!loading && !isEmpty && (
        <Link
          to="/merchandise"
          className="group inline-flex items-center gap-2 rounded-full border border-emerald-400/30 px-6 py-3 font-loc-display text-sm font-bold tracking-[0.03em] text-emerald-100 uppercase transition-colors duration-200 hover:border-loc-gold/50 hover:text-white"
        >
          <ShoppingBag className="h-4 w-4" aria-hidden="true" />
          Explore Merchandise
          <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
        </Link>
      )}
    </div>
  )
}
