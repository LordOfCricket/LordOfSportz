import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { formatPrice } from '../../lib/money.js'

// Shared product card — the homepage MerchandiseSection and the /merchandise
// catalog page render the same LOC light card so they stay visually
// identical. Pure presentation from the public API shape
// (services/merchandise.js); no cart / checkout — the CTA is a link to the
// read-only detail page.
export default function MerchandiseCard({ product }) {
  const selling = formatPrice(product.sellingPrice)
  const original = product.onSale ? formatPrice(product.originalPrice) : null

  return (
    <Link
      to={`/merchandise/${product.id}`}
      className="loc-card loc-card-hover group flex h-full flex-col overflow-hidden no-underline"
    >
      <div className="relative h-56 w-full shrink-0 overflow-hidden bg-loc-mint">
        {product.imageUrl ? (
          <img
            src={product.imageUrl}
            alt={product.name}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-5xl">🏏</div>
        )}
        {product.status === 'OUT_OF_STOCK' && (
          <span className="absolute right-3 top-3 rounded-full bg-white/90 px-3 py-1 text-[11px] font-bold tracking-wide uppercase text-slate-500 shadow-sm">
            Out of Stock
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-5">
        <div className="flex-1">
          <h3 className="font-loc-display text-lg font-bold uppercase text-loc-navy">{product.name}</h3>
          {product.category && <p className="mt-0.5 text-xs tracking-wide uppercase text-loc-faint">{product.category}</p>}
          {product.description && <p className="mt-2 line-clamp-2 text-sm text-loc-muted">{product.description}</p>}
        </div>

        <div className="flex items-baseline gap-2">
          <span className="font-loc-display text-xl font-extrabold text-loc-green">{selling}</span>
          {original && <span className="text-sm text-loc-faint line-through">{original}</span>}
        </div>

        <span className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-loc-muted transition-colors group-hover:text-loc-navy">
          View Product
          <ArrowRight className="h-3 w-3 transition-transform duration-200 group-hover:translate-x-1" />
        </span>
      </div>
    </Link>
  )
}
