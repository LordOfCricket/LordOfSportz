import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { useSeoMeta } from '../../hooks/useSeoMeta.js'
import Navbar from '../../components/home/Navbar.jsx'
import SiteFooter from '../../components/home/SiteFooter.jsx'
import { getMerchandiseItem } from '../../services/merchandise.js'
import { formatPrice } from '../../lib/money.js'

const STATUS_LABEL = {
  ACTIVE: { label: 'In Stock', className: 'bg-loc-mint text-loc-green' },
  OUT_OF_STOCK: { label: 'Out of Stock', className: 'bg-slate-100 text-slate-500' },
}

// Read-only product detail — the per-card CTA target. Shows image, name,
// description, price and stock status. No cart / checkout / add-to-bag:
// that's future e-commerce scope, deliberately not built here.
export default function MerchandiseDetailPage() {
  const { id } = useParams()
  // One state object keyed by the id it was loaded for — lets an id change
  // read as "loading" without a synchronous setState inside the effect.
  const [entry, setEntry] = useState({ id: null, product: null, error: null })

  useEffect(() => {
    let cancelled = false
    getMerchandiseItem(id)
      .then((data) => {
        if (!cancelled) setEntry({ id, product: data, error: null })
      })
      .catch((err) => {
        if (!cancelled) {
          setEntry({ id, product: null, error: err.response?.status === 404 ? 'This product is no longer available.' : "Couldn't load this product." })
        }
      })
    return () => {
      cancelled = true
    }
  }, [id])

  const ready = entry.id === id
  const product = ready ? entry.product : null
  const error = ready ? entry.error : null

  useSeoMeta({
    title: product ? `${product.name} — LOC Merchandise` : 'LOC Merchandise',
    description: product?.description || 'Official Lord Of Cricket merchandise.',
    canonical: `${window.location.origin}/merchandise/${id}`,
  })

  const loading = !product && !error
  const status = product ? STATUS_LABEL[product.status] : null
  const original = product?.onSale ? formatPrice(product.originalPrice) : null

  return (
    <div className="loc-page overflow-x-hidden">
      <Navbar theme="light" />

      <main className="relative mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 pt-28 pb-20 lg:px-10">
        <Link to="/merchandise" className="inline-flex items-center gap-1.5 text-sm font-semibold text-loc-muted transition-colors hover:text-loc-navy">
          <ArrowLeft className="h-4 w-4" />
          Back to Merchandise
        </Link>

        {error ? (
          <p className="text-red-600">{error}</p>
        ) : loading ? (
          <div className="grid gap-8 lg:grid-cols-2">
            <div className="aspect-square animate-pulse rounded-3xl border border-loc-border bg-loc-mint" />
            <div className="flex flex-col gap-4">
              <div className="h-8 w-2/3 animate-pulse rounded-full bg-loc-mint" />
              <div className="h-24 w-full animate-pulse rounded-2xl bg-loc-mint" />
            </div>
          </div>
        ) : (
          <div className="grid gap-8 lg:grid-cols-2">
            <div className="overflow-hidden rounded-3xl border border-loc-border bg-loc-mint">
              {product.imageUrl ? (
                <img src={product.imageUrl} alt={product.name} className="h-full w-full object-cover" />
              ) : (
                <div className="flex aspect-square w-full items-center justify-center bg-loc-mint">
                  <span className="font-loc-display text-7xl font-bold text-loc-green/30">{product.name?.charAt(0)}</span>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-5">
              {product.category && <span className="loc-eyebrow">{product.category}</span>}
              <h1 className="loc-heading font-loc-display text-3xl tracking-[0.03em] sm:text-4xl">{product.name}</h1>

              <div className="flex items-baseline gap-3">
                <span className="font-loc-display text-3xl font-extrabold text-loc-green">{formatPrice(product.sellingPrice)}</span>
                {original && <span className="text-lg text-loc-faint line-through">{original}</span>}
              </div>

              {status && (
                <span className={`w-fit rounded-full px-3 py-1 text-[11px] font-bold tracking-wide uppercase ${status.className}`}>
                  {status.label}
                </span>
              )}

              {product.description && <p className="leading-relaxed text-loc-muted">{product.description}</p>}

              <p className="mt-2 rounded-2xl border border-loc-border bg-loc-mint px-4 py-3 text-sm text-loc-muted">
                Online ordering is coming soon. For purchase enquiries, contact the LOC team.
              </p>
            </div>
          </div>
        )}
      </main>

      <SiteFooter theme="light" />
    </div>
  )
}
